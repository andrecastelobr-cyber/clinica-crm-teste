"""Checks actual SQL statements from the API against SQLite, without dependencies."""
import re
import sqlite3
import unittest
from pathlib import Path

SOURCE = Path('legacy/cloudflare/api/crm/route.ts').read_text()
SCHEMA = Path('legacy/cloudflare/db/schema.ts').read_text()

class DatabaseTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        for table, fields in re.findall(r'sqliteTable\("(\w+)", \{ (.*?) \}', SCHEMA):
            cols = []
            for key, name, tail in re.findall(r'(\w+):text\("(\w+)"\)(.*?)(?=, \w+:text|$)', fields):
                cols.append('"'+name+'" TEXT'+(' PRIMARY KEY' if '.primaryKey()' in tail else '')+(' NOT NULL' if '.notNull()' in tail else ''))
            self.db.execute('CREATE TABLE '+table+' ('+', '.join(cols)+')')
        self.db.execute('CREATE UNIQUE INDEX clinic_email ON members(clinic,email)')
        self.sql = re.findall(r'prepare\("([^"]+)"\)', SOURCE)
        self.db.execute('INSERT INTO clinics VALUES(?,?,?)', ('c1','One','owner1'))
        self.db.execute('INSERT INTO clinics VALUES(?,?,?)', ('c2','Two','owner2'))
        self.db.execute('INSERT INTO members VALUES(?,?,?,?,?,?)', ('m1','c1','doc@example.com','professional','Doctor','Medicina'))
        self.db.execute('INSERT INTO members VALUES(?,?,?,?,?,?)', ('m2','c2','other@example.com','professional','Other','Odontologia'))
        self.db.execute('INSERT INTO patients VALUES(?,?,?,?,?,?)', ('p1','c1','Patient','2000-01-01','','2026-01-01'))
        self.db.execute('INSERT INTO patients VALUES(?,?,?,?,?,?)', ('p2','c2','Other Patient','2000-01-01','','2026-01-01'))

    def query(self,prefix):
        return next(s for s in self.sql if s.startswith(prefix))

    def book(self,uid,start,end,status='Agendada'):
        return self.db.execute(self.query('INSERT INTO appointments SELECT'),(uid,'c1','p1','m1',start,end,status,'Consulta','c1','m1',end,start)).rowcount

    def test_conflict_and_adjacent_times(self):
        self.assertEqual(self.book('a1','2026-11-06T12:00:00.000Z','2026-11-06T13:00:00.000Z'),1)
        self.assertEqual(self.book('a2','2026-11-06T12:30:00.000Z','2026-11-06T13:30:00.000Z'),0)
        self.assertEqual(self.book('a3','2026-11-06T13:00:00.000Z','2026-11-06T14:00:00.000Z'),1)

    def test_cancelled_slot_can_be_reused(self):
        self.book('a1','a','b','Cancelada')
        self.assertEqual(self.book('a2','a','b'),1)

    def test_patient_isolation(self):
        result=self.db.execute(self.query('SELECT * FROM patients WHERE clinic='),('c1',)).fetchall()
        self.assertEqual([r[0] for r in result],['p1'])
        self.assertIsNone(self.db.execute(self.query('SELECT id FROM patients WHERE id='),('p2','c1')).fetchone())

    def test_status_update_cannot_cross_clinics(self):
        self.book('a1','a','b')
        changed=self.db.execute(self.query('UPDATE appointments'),('Concluída','a1','c2')).rowcount
        self.assertEqual(changed,0)

    def test_notes_insert_and_isolation(self):
        self.db.execute(self.query('INSERT INTO notes VALUES'),('n1','c1','p1','doc@example.com','Medicina','Relato','','','Plano','','2026-11-06'))
        self.assertEqual(len(self.db.execute(self.query('SELECT * FROM notes'),('c1','p1')).fetchall()),1)
        self.assertEqual(len(self.db.execute(self.query('SELECT * FROM notes'),('c2','p1')).fetchall()),0)

    def test_agenda_excludes_admin_and_other_clinics(self):
        self.db.execute('INSERT INTO members VALUES(?,?,?,?,?,?)', ('admin','c1','admin@example.com','admin','Admin','Medicina'))
        self.book('a1','2026-11-06T12:00:00.000Z','2026-11-06T13:00:00.000Z')
        self.db.execute('INSERT INTO appointments VALUES(?,?,?,?,?,?,?,?)', ('a2','c1','p1','admin','a','b','Agendada','Consulta'))
        self.db.execute('INSERT INTO appointments VALUES(?,?,?,?,?,?,?,?)', ('a3','c2','p2','m2','a','b','Agendada','Consulta'))
        rows=self.db.execute(self.query('SELECT a.*,p.name'), ('c1',)).fetchall()
        self.assertEqual([r[0] for r in rows], ['a1'])
        eligible=self.query('SELECT id FROM members WHERE id=')
        self.assertIsNone(self.db.execute(eligible,('admin','c1')).fetchone())
        self.assertIsNone(self.db.execute(eligible,('m2','c1')).fetchone())

    def test_team_hides_only_default_administrator(self):
        self.db.execute('INSERT INTO members VALUES(?,?,?,?,?,?)', ('owner','c1','owner@example.com','admin','Default','Medicina'))
        self.db.execute('INSERT INTO members VALUES(?,?,?,?,?,?)', ('other-admin','c1','manager@example.com','admin','Manager','Medicina'))
        self.db.execute('INSERT INTO audit VALUES(?,?,?,?,?,?)', ('audit1','c1','Owner@Example.com','clinic','c1','2026-11-06'))
        rows=self.db.execute(self.query('SELECT id,name,email,role,specialty FROM members'), ('c1','c1')).fetchall()
        self.assertEqual({r[0] for r in rows}, {'m1','other-admin'})

    def test_members_unique_within_clinic(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(self.query('INSERT INTO members VALUES'),('m3','c1','doc@example.com','professional','Name','Medicina'))

if __name__=='__main__': unittest.main()
