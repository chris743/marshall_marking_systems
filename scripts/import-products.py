import csv
import pyodbc
import uuid
from datetime import datetime

# ----------------------------
# CONFIG
# ----------------------------
CSV_PATH = r"C:/Users/chrism/Downloads/Report60335301.CSV"
SERVER = "RDGW-CF"
DATABASE = "DM02"
SCHEMA = "dbo"
TABLE = "labeling_products"

# If you want to wipe the table before importing, set True
TRUNCATE_FIRST = False

# Batch size for inserts
BATCH_SIZE = 1000

# ----------------------------
# COLUMN MAP (CSV -> TABLE)
# Supports your earlier CSV headers.
# If your CSV already uses table column names, it will work without this.
# ----------------------------
COLUMN_MAP = {
    "productidx": "product_idx",
    "productseq": "product_seq",
    "inactiveflag": "inactive",
    "descr": "description",
    "casecompanyprefix": "company_prefix",
    "caseitemreference": "item_reference",
    "caseindicatordigit": "indicator_digit",
    "externalupc": "external_upc",
    "externalplu": "external_plu",
    "ascompanyname": "company_name",
    # if CSV already has gtin, it maps 1:1
    "gtin": "gtin",
}

# Table columns from your screenshot (exclude id/created_at/updated_at unless your CSV includes them)
TARGET_COLUMNS_DEFAULT = [
    "product_idx",
    "product_seq",
    "inactive",
    "description",
    "company_prefix",
    "item_reference",
    "indicator_digit",
    "external_upc",
    "external_plu",
    "gtin",
    "company_name",
    # created_at / updated_at can be omitted to use defaults in table
]

# ----------------------------
# Helpers
# ----------------------------
def norm(s: str) -> str:
    return (s or "").strip().lower()

def empty_to_none(v):
    if v is None:
        return None
    v = str(v).strip()
    return None if v == "" else v

def to_int_or_none(v):
    v = empty_to_none(v)
    if v is None:
        return None
    try:
        # Handles "499933.0" style inputs too
        return int(float(v))
    except Exception:
        return None

def to_bit_or_none(v):
    v = empty_to_none(v)
    if v is None:
        return None
    s = str(v).strip().upper()
    if s in ("1", "Y", "YES", "TRUE", "T"):
        return 1
    if s in ("0", "N", "NO", "FALSE", "F"):
        return 0
    # fallback: try numeric
    try:
        return 1 if int(float(s)) != 0 else 0
    except Exception:
        return None

def chunked(iterable, n):
    batch = []
    for item in iterable:
        batch.append(item)
        if len(batch) >= n:
            yield batch
            batch = []
    if batch:
        yield batch

# ----------------------------
# Main import
# ----------------------------
def main():
    full_table = f"[{DATABASE}].[{SCHEMA}].[{TABLE}]"
    print(f"Importing CSV -> {full_table}")
    print(f"CSV: {CSV_PATH}")

    # Read header
    with open(CSV_PATH, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        if reader.fieldnames is None:
            raise RuntimeError("CSV appears to have no header row.")

        # Build CSV->table column mapping
        csv_cols = [norm(c) for c in reader.fieldnames]
        mapped = {}

        for c in csv_cols:
            # Skip 'id' from CSV - we always generate our own UUIDs
            if c == "id":
                continue
            # if CSV already uses table column name, keep it
            if c in [x.lower() for x in TARGET_COLUMNS_DEFAULT] or c in ("created_at", "updated_at"):
                mapped[c] = c  # same name (normalized later)
            elif c in COLUMN_MAP:
                mapped[c] = COLUMN_MAP[c]  # legacy name -> table name
            # else: ignore extra columns

        # Decide final insert column list (only those present in CSV after mapping)
        # Always include 'id' since it's required (we'll generate UUIDs)
        insert_cols = ["id"]  # Always first - we generate this
        for col in TARGET_COLUMNS_DEFAULT:
            # include if any CSV field maps to it
            if col in mapped.values():
                insert_cols.append(col)

        # If CSV provides created_at/updated_at explicitly, include them too
        for special in ("created_at", "updated_at"):
            if special in mapped.values():
                insert_cols.append(special)

        if not insert_cols:
            raise RuntimeError(
                "No matching columns found between CSV and labeling_products. "
                "Check header names or update COLUMN_MAP."
            )

        print(f"Insert columns ({len(insert_cols)}): {insert_cols}")

        # Connect
        conn_str = (
            "DRIVER={ODBC Driver 17 for SQL Server};"
            f"SERVER={SERVER};"
            f"DATABASE={DATABASE};"
            "Trusted_Connection=yes;"
        )
        conn = pyodbc.connect(conn_str)
        cur = conn.cursor()
        cur.fast_executemany = True

        try:
            if TRUNCATE_FIRST:
                print("Truncating target table...")
                cur.execute(f"TRUNCATE TABLE {full_table};")
                conn.commit()

            # Prepare insert SQL
            col_list = ", ".join(f"[{c}]" for c in insert_cols)
            params = ", ".join("?" for _ in insert_cols)
            insert_sql = f"INSERT INTO {full_table} ({col_list}) VALUES ({params})"

            def row_generator():
                for row in reader:
                    # Normalize incoming keys
                    normalized_row = {norm(k): v for k, v in row.items()}

                    # Build output dict keyed by table column
                    out = {c: None for c in insert_cols}

                    # Generate UUID for id column
                    out["id"] = str(uuid.uuid4()).upper()

                    for csv_key_norm, table_col in mapped.items():
                        # csv_key_norm is normalized, lookup in normalized_row
                        raw_val = normalized_row.get(csv_key_norm)

                        # Never overwrite the generated id
                        if table_col == "id":
                            continue

                        if table_col not in out:
                            continue

                        # Coerce types based on target column
                        if table_col in ("product_idx", "product_seq"):
                            out[table_col] = to_int_or_none(raw_val)
                        elif table_col == "inactive":
                            out[table_col] = to_bit_or_none(raw_val)
                        elif table_col in ("created_at", "updated_at"):
                            # if your CSV includes these; otherwise omit them to use defaults
                            v = empty_to_none(raw_val)
                            if v is None:
                                out[table_col] = None
                            else:
                                # Accept ISO-ish strings; otherwise leave as string and let SQL parse if possible
                                out[table_col] = v
                        else:
                            out[table_col] = empty_to_none(raw_val)

                    # Return tuple in insert_cols order
                    yield tuple(out[c] for c in insert_cols)

            total = 0
            for batch in chunked(row_generator(), BATCH_SIZE):
                cur.executemany(insert_sql, batch)
                total += len(batch)
                print(f"Inserted {total} rows...")

            conn.commit()
            print(f"Done. Inserted {total} rows into {full_table}.")

        finally:
            try:
                cur.close()
            except Exception:
                pass
            conn.close()


if __name__ == "__main__":
    main()
