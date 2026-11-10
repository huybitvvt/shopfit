"""Copy a stopped SQLite backend to an empty Supabase database, without deleting the source."""
import argparse
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
import sqlite3

from psycopg import sql

from .config import Settings
from .db import Database, TABLES


def migrate_sqlite(source: Path, target: Database, backup_dir: Path) -> dict:
    source = source.resolve()
    if not target.postgres:
        raise ValueError("Set DATABASE_URL to the destination Supabase PostgreSQL URL")
    if not source.is_file():
        raise ValueError("Source SQLite database does not exist")
    backup_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    backup = backup_dir / f"shopfit-before-supabase-{stamp}.sqlite3"
    with sqlite3.connect(source.as_uri() + "?mode=ro", uri=True) as original:
        with sqlite3.connect(backup) as snapshot:
            original.backup(snapshot)

    target.initialize(seed=False)
    counts = {}
    with sqlite3.connect(backup.resolve().as_uri() + "?mode=ro", uri=True) as snapshot:
        names = {row[0] for row in snapshot.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}
        if names != set(TABLES):
            raise ValueError("Source tables differ from ShopFit's schema; refusing to skip data")
        if snapshot.execute("PRAGMA foreign_key_check").fetchone():
            raise ValueError("Source SQLite database contains invalid foreign keys")
        with target.connect() as connection:
            target.begin_write(connection)
            pg = connection.connection
            pg.execute(sql.SQL("LOCK TABLE {} IN ACCESS EXCLUSIVE MODE").format(sql.SQL(", ").join(map(sql.Identifier, TABLES))))
            if any(connection.execute(f'SELECT 1 FROM "{table}" LIMIT 1').fetchone() for table in TABLES):
                raise ValueError("Destination contains data; refusing to overwrite or duplicate it")
            for table in TABLES:
                columns = [row[1] for row in snapshot.execute(f'PRAGMA table_info("{table}")')]
                destination_columns = {row[0] for row in connection.execute(
                    "SELECT column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=?", (table,))}
                if set(columns) != destination_columns:
                    raise ValueError(f"Column mismatch in {table}; upgrade the SQLite schema first")
                selection = ', '.join(f'"{column}"' for column in columns)
                source_rows = snapshot.execute(f'SELECT {selection} FROM "{table}"').fetchall()
                with pg.cursor() as cursor:
                    command = sql.SQL("COPY {} ({}) FROM STDIN").format(
                        sql.Identifier(table), sql.SQL(", ").join(map(sql.Identifier, columns)))
                    with cursor.copy(command) as copy:
                        for row in source_rows:
                            copy.write_row(row)
                copied = connection.execute(f'SELECT {selection} FROM "{table}"').fetchall()
                if Counter(source_rows) != Counter(tuple(row[column] for column in columns) for row in copied):
                    raise ValueError(f"Data verification failed for {table}; transaction rolled back")
                counts[table] = len(copied)
            # Imported IDs must not collide with the next newly created order item.
            connection.execute("""SELECT setval(pg_get_serial_sequence('order_items','id'),
                coalesce((SELECT max(id) FROM order_items),1), EXISTS(SELECT 1 FROM order_items))""")
    return {"backup": str(backup), "rows": counts, "total_rows": sum(counts.values())}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, help="Source SQLite file; defaults to DATA_DIR/shopfit.sqlite3")
    args = parser.parse_args()
    settings = Settings()
    db = Database(settings)
    try:
        result = migrate_sqlite(args.source or db.path, db, settings.data_dir / "backups")
        print(f"Verified {result['total_rows']} rows across {len(result['rows'])} tables.")
        for table, count in result["rows"].items():
            print(f"  {table}: {count}")
        print(f"SQLite backup: {result['backup']}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
