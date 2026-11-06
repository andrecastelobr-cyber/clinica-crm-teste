import re
import sqlite3
import unittest
from pathlib import Path

SOURCE=Path('legacy/cloudflare/api/inventory/route.ts').read_text()
class InventoryTests(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(':memory:')
        self.db.execute('PRAGMA foreign_keys=ON')
        for file in sorted(Path('legacy/cloudflare/drizzle').glob('*.sql')):
            self.db.executescript(file.read_text())
        self.db.execute('INSERT INTO clinics VALUES(?,?,?)',('c1','One','owner1'))
        self.db.execute('INSERT INTO clinics VALUES(?,?,?)',('c2','Two','owner2'))
        self.sql=re.findall(r"prepare\('([^']+)'\)",SOURCE)
    def query(self,prefix):return next(q for q in self.sql if q.startswith(prefix))
    def create(self,id='p1',clinic='c1',code='P1'):
        self.db.execute(self.query('INSERT INTO products'),(id,clinic,code,'Produto',1250,1990,'now','now'))
    def test_code_unique_per_clinic(self):
        self.create()
        self.create('p2','c2')
        with self.assertRaises(sqlite3.IntegrityError):self.create('p3')
    def test_crud_and_cross_clinic_isolation(self):
        self.create()
        self.assertEqual(len(self.db.execute(self.query('SELECT id,clinic,code'),('c1',)).fetchall()),1)
        self.assertEqual(self.db.execute(self.query('SELECT id,clinic,code'),('c2',)).fetchall(),[])
        update=self.query('UPDATE products')
        self.assertEqual(self.db.execute(update,('c2','X','Changed',2000,500,'later','p1','c2')).rowcount,0)
        self.assertEqual(self.db.execute(self.query('DELETE FROM products'),('p1','c2')).rowcount,0)
        self.assertEqual(self.db.execute(update,('c1','X','Changed',2000,500,'later','p1','c1')).rowcount,1)
        self.assertEqual(self.db.execute('SELECT code,quantity_milli,unit_cents FROM products').fetchone(),('X',2000,500))
        self.assertEqual(self.db.execute(self.query('DELETE FROM products'),('p1','c1')).rowcount,1)
    def test_transfer_and_membership(self):
        self.create()
        self.db.execute(self.query('UPDATE products'),('c2','P1','Product',1250,1990,'later','p1','c1'))
        self.assertEqual(self.db.execute(self.query('SELECT id,clinic,code'),('c1',)).fetchall(),[])
        self.assertEqual(len(self.db.execute(self.query('SELECT id,clinic,code'),('c2',)).fetchall()),1)
        access=self.query('SELECT c.id')
        self.assertIsNotNone(self.db.execute(access,('c1','owner1','none')).fetchone())
        self.assertIsNone(self.db.execute(access,('c2','owner1','none')).fetchone())
        self.db.execute('INSERT INTO members VALUES(?,?,?,?,?,?)',('m1','c2','member@test.com','reception','Member','Recepção'))
        self.assertIsNotNone(self.db.execute(access,('c2','other','member@test.com')).fetchone())
    def test_migration_preserves_existing_data(self):
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM clinics').fetchone()[0],2)
        self.assertEqual(self.db.execute('PRAGMA integrity_check').fetchone()[0],'ok')
if __name__=='__main__':unittest.main()
