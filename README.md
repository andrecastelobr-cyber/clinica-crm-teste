# Clínica CRM — Next.js + Supabase + Vercel

CRM em português para várias clínicas: agenda por dia/profissional, pacientes, prontuários médicos e odontológicos, equipe, estoque e financeiro parcelado.

## Estado desta adaptação

A aplicação usa Next.js e as APIs oficiais de Auth/PostgREST do Supabase. Não depende do Sites, Vinext, Cloudflare Workers nem de identidade enviada em cabeçalhos de proxy. O servidor usa a chave publicável e o token de cada usuário; nenhuma service role é necessária.

A compilação pode ser feita sem credenciais. Para entrar e usar os módulos, é necessário configurar um projeto Supabase e aplicar a migração PostgreSQL. A aplicação ainda não está publicada nem conectada a um Supabase real. Os dados do banco SQLite local anterior NÃO foram alterados ou transferidos.

## 1. Criar o Supabase

1. Crie um projeto em South America / São Paulo (`sa-east-1`). Separe projetos de teste e produção.
2. Em SQL Editor, execute **uma vez, em um projeto novo** o arquivo `supabase/migrations/202611060001_initial.sql`. Ele cria dez tabelas, índices, regras RLS e seis funções transacionais RPC.
3. Em Authentication, habilite o provedor Email. Desabilite cadastro público se o acesso for somente por contas cadastradas pelo administrador. Não habilite login anônimo.
4. Crie seu usuário em Authentication > Users, com e-mail confirmado e senha. O CRM não oferece cadastro público.
5. Obtenha a URL do projeto e a chave **Publishable** no painel. A chave legada `anon` também é compatível. Não use `service_role`, `sb_secret_` nem senha do banco no aplicativo.
6. Para novos membros: crie suas contas no Supabase e cadastre o mesmo e-mail na Equipe da clínica. O sistema não envia convites automaticamente.

A recuperação de senha nesta versão é administrativa pelo painel do Supabase. Ainda não há tela de recuperação/MFA no CRM.

## 2. Configurar e testar no Mac

Requisito: Node.js 24 LTS e npm.

```sh
cd /Users/acb/Projects/clinica-crm
npm ci
cp .env.example .env.local
```

Edite `.env.local` preenchendo `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` com os valores do projeto de teste. O arquivo é ignorado pelo Git. Não envie credenciais nesta conversa nem as publique no repositório.

```sh
npm run check:env
npm run dev
```

Abra o endereço exibido no Terminal, normalmente `http://127.0.0.1:3000`. Entre com o usuário criado no Supabase, cadastre uma clínica e teste os módulos com dados fictícios. O login de teste automático `seedy@sites.test` foi removido.

## 3. Validar o banco de teste

No **projeto de teste**, após a migração, execute `supabase/tests/access-and-payments.sql` pelo SQL Editor, como postgres. O teste cria usuários/dados sintéticos e termina com ROLLBACK. Verifica acesso entre clínicas, privilégios, prontuários da recepção, colisões e cancelamentos de agenda, parcelas, pagamento parcial/idempotente, sobrepagamento e transferência de estoque não autorizada.

Este teste PostgreSQL precisa ser executado no Supabase; não pode ser substituído pelos testes SQLite históricos. Também teste com navegadores/contas independentes e duas baixas simultâneas para confirmar o comportamento real.

## 4. Publicar na Vercel

1. Envie o código para um repositório **privado** no GitHub. Um commit no GitHub não publica a aplicação sozinho.
2. Na Vercel, importe o repositório e selecione Next.js. `vercel.json` define São Paulo (`gru1`), `npm ci` e `npm run build`.
3. Em Environment Variables, configure `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY`. Use o Supabase de produção apenas em Production; os deployments de Preview devem usar um projeto de teste separado.
4. Confirme que a migração foi aplicada no Supabase de produção antes do uso.
5. Publique e teste login, saída, renovação da sessão, clínicas, agenda, prontuários, estoque e financeiro no endereço HTTPS gerado.
6. Se usar recursos de e-mail/redirecionamento do Supabase, configure Site URL com o domínio HTTPS da aplicação e só os Redirect URLs realmente utilizados. Configure SMTP próprio antes de depender de e-mails do sistema.
7. Um domínio próprio pode ser adicionado nas configurações do projeto Vercel e no DNS do domínio.

A aplicação não depende da lista de visitantes do Sites. O acesso aos dados depende da conta confirmada no Supabase e do vínculo de cada e-mail às clínicas. O proprietário da clínica tem acesso administrativo; o administrador padrão fica oculto na equipe e na agenda.

## Sessões e autorização

- Login e logout são POST com verificação de origem. As senhas são enviadas do servidor ao endpoint HTTPS do Supabase, sem gravação em logs ou no banco do CRM.
- Tokens ficam em cookies HttpOnly/SameSite=Lax e Secure em produção, com renovação pelo `proxy.ts`.
- Cada página/rota valida o usuário com `/auth/v1/user`. O JWT é lido localmente apenas para decidir quando renovar, nunca como prova de identidade.
- O banco confere `auth.uid()` e o e-mail atual confirmado em `auth.users`. Papéis recebidos do navegador são ignorados.
- Tabelas têm RLS e acesso de escrita revogado para clientes. Funções SECURITY DEFINER têm search_path vazio, autenticação/autorização explícitas e execução revogada para PUBLIC/anon.
- Prontuários só são lidos pela função que registra auditoria. A recepção não acessa o conteúdo. Evoluções não têm edição/exclusão.
- Agenda usa bloqueio transacional por profissional; baixas financeiras bloqueiam a parcela antes de calcular o saldo. A repetição do mesmo pagamento com o mesmo identificador é idempotente.

## Dados e operação clínica

O diretório `legacy/cloudflare` preserva fonte e migrações do protótipo anterior. O banco SQLite e seus backups permanecem em `.wrangler` e `.sites-runtime`, fora do Git. A migração de dados antigos é um trabalho separado: exige exportação, vínculo dos antigos proprietários aos novos usuários Supabase e validação, sem substituir o banco original.

Antes de inserir dados reais, valide permissões, requisitos de prontuário/privacidade, monitoramento e restauração de backups. Região no Brasil não representa certificação de conformidade. Configure a retenção/recuperação conforme a operação. Backups do banco Supabase não incluem os arquivos do Storage; anexos, quando implementados, precisam de estratégia própria.

## Verificações

```sh
npm run typecheck
npm test
npm run build
npm run test:legacy
```

`npm test` cobre cálculos, validações e fluxo HTTP/autorização com respostas Supabase simuladas. `test:legacy` executa testes do SQL SQLite arquivado, somente para regressão do protótipo. Não comprovam a execução da migração PostgreSQL nem o login em um Supabase real.

Referências: [Supabase Auth](https://supabase.com/docs/guides/auth), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [funções de banco](https://supabase.com/docs/guides/database/functions), [backups](https://supabase.com/docs/guides/platform/backups), [regiões Vercel](https://vercel.com/docs/regions).

Validação desta adaptação: compilação Next.js e TypeScript aprovados; 20 testes Node (com Supabase simulado) e 17 testes históricos SQLite aprovados. O script SQL de integração foi preparado, mas ainda não executado por falta de um PostgreSQL/Supabase configurado. `npm run check:env` confirma que as duas variáveis Supabase ainda estão ausentes.

## Alterar horário de consulta (07/11/2026)

Depois da migração inicial, aplique `supabase/migrations/202611070001_reschedule_appointment.sql` no SQL Editor do mesmo projeto Supabase. O arquivo adiciona a operação sem recriar tabelas ou apagar consultas. Aplique antes de publicar a nova interface. O teste `supabase/tests/access-and-payments.sql` agora requer ambas as migrações.

Na aba Agenda, clique na consulta e em **Alterar horário**. Informe início e fim em horário de Brasília e salve. A agenda passa para a data escolhida. Paciente, profissional e status são preservados; consultas canceladas ou concluídas não são remarcadas. O banco rejeita sobreposição, valida acesso à clínica e registra auditoria.
