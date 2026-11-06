import re
import sqlite3
import unittest
from pathlib import Path

SOURCE=Path('legacy/cloudflare/api/finance/route.ts').read_text()
class FinanceTests(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(':memory:')
        self.db.execute('PRAGMA foreign_keys=ON')
        for file in sorted(Path('legacy/cloudflare/drizzle').glob('*.sql')):self.db.executescript(file.read_text())
        self.sql=re.findall(r"prepare\('([^']+)'\)",SOURCE)
        for n in ['1','2']:
            self.db.execute('INSERT INTO clinics VALUES(?,?,?)',('c'+n,'Clinic '+n,'owner'+n))
            self.db.execute('INSERT INTO patients VALUES(?,?,?,?,?,?)',('p'+n,'c'+n,'Patient '+n,'2000-01-01','','now'))
        self.db.execute(self.query('INSERT INTO charges'),('charge1','c1','p1','Treatment',10000,3,'now'))
        for number,amount in enumerate([3333,3333,3334],1):
            self.db.execute(self.query('INSERT INTO installments'),('i'+str(number),'c1','charge1',number,amount))
    def query(self,prefix):return next(s for s in self.sql if s.startswith(prefix))
    def pay(self,id,amount,installment='i1',clinic='c1'):
        return self.db.execute(self.query('INSERT INTO payments'),(id,clinic,installment,amount,'2026-11-06','owner1','now',installment,clinic,amount)).rowcount
    def test_installments_generated_and_balance_reaches_zero(self):
        self.assertEqual(self.pay('pay1',3333),1)
        self.assertEqual(self.pay('pay2',3333,'i2'),1)
        self.assertEqual(self.pay('pay3',3334,'i3'),1)
        result=self.db.execute(self.query('SELECT c.id,c.clinic'),('c1',)).fetchone()
        self.assertEqual(result[-2:],(10000,0))
        rows=self.db.execute(self.query('SELECT i.id,i.number'),('c1','charge1')).fetchall()
        self.assertEqual([r[4] for r in rows],[0,0,0])
    def test_partial_payments_and_overpayment_prevention(self):
        self.assertEqual(self.pay('pay1',1000),1)
        self.assertEqual(self.pay('pay2',2334),0)
        self.assertEqual(self.pay('pay3',2333),1)
        self.assertEqual(self.pay('pay4',1),0)
        result=self.db.execute(self.query('SELECT c.id,c.clinic'),('c1',)).fetchone()
        self.assertEqual(result[-2:],(3333,6667))
    def test_cross_clinic_access_and_mutation(self):
        self.assertEqual(self.pay('bad',3333,clinic='c2'),0)
        self.assertEqual(self.db.execute(self.query('SELECT c.id,c.clinic'),('c2',)).fetchall(),[])
        self.assertEqual(self.db.execute(self.query('SELECT i.id,i.number'),('c2','charge1')).fetchall(),[])
        self.assertIsNone(self.db.execute(self.query('SELECT id FROM patients'),('p2','c1')).fetchone())
    def test_payment_idempotency_and_history(self):
        self.pay('pay1',1000)
        prior=self.db.execute(self.query('SELECT id,installment,amount_cents'),('pay1','c1')).fetchone()
        self.assertEqual(prior,('pay1','i1',1000,'2026-11-06'))
        with self.assertRaises(sqlite3.IntegrityError):self.pay('pay1',1000)
        rows=self.db.execute(self.query('SELECT p.id,p.installment'),('c1','charge1')).fetchall()
        self.assertEqual(len(rows),1)
        self.assertEqual(rows[0][2:4],(1000,'2026-11-06'))
    def test_parcels_may_be_paid_out_of_order(self):
        self.pay('pay3',3334,'i3')
        result=self.db.execute(self.query('SELECT c.id,c.clinic'),('c1',)).fetchone()
        self.assertEqual(result[-2:],(3334,6666))
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM installments').fetchone()[0],3)
if __name__=='__main__':unittest.main()
