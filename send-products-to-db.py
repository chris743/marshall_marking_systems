import pandas as pd
import pyodbc

# ----------------------------
# CONFIG
# ----------------------------
CSV_PATH = r"C:/Users/chrism/Downloads/Report60335301.CSV"
TABLE_NAME = "dbo.labeling_products"

SERVER = "rdgw-cf"
DATABASE = "dm02"
# ----------------------------

BIGINT_COLS_CANDIDATES = {"listidx", "productseq", "productseg", "productidx"}

def to_py_int_or_none(x):
    """Convert to a plain Python int or None."""
    if x is None:
        return None
    if pd.isna(x):
        return None
    try:
        return int(x)
    except Exception:
        return None

def main():
    # Read CSV as strings (prevents pandas guessing types)
    df = pd.read_csv(CSV_PATH, dtype=str, keep_default_na=False)
    df.columns = [c.strip() for c in df.columns]

    # Windows Auth connection
    conn_str = (
        "DRIVER={ODBC Driver 17 for SQL Server};"
        f"SERVER={SERVER};"
        f"DATABASE={DATABASE};"
        "Trusted_Connection=yes;"
    )

    conn = pyodbc.connect(conn_str)
    cursor = conn.cursor()
    cursor.fast_executemany = True

    # Fetch table columns in order
    schema_sql = """
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
    ORDER BY ORDINAL_POSITION
    """
    schema, table = TABLE_NAME.split(".", 1)
    table_cols = [r[0] for r in cursor.execute(schema_sql, schema, table).fetchall()]

    # --- Fix the productseq/productseg mismatch automatically ---
    # If table expects productseq but CSV has productseg -> rename to productseq
    if "productseq" in table_cols and "productseq" not in df.columns and "productseg" in df.columns:
        df = df.rename(columns={"productseg": "productseq"})

    # If table expects productseg but CSV has productseq -> rename to productseg (just in case)
    if "productseg" in table_cols and "productseg" not in df.columns and "productseq" in df.columns:
        df = df.rename(columns={"productseq": "productseg"})

    # Empty strings -> NULL
    df = df.replace({"": None})

    # Only insert columns that exist in the table (in table order)
    insert_cols = [c for c in table_cols if c in df.columns]
    missing_in_csv = [c for c in table_cols if c not in df.columns]
    extra_in_csv = [c for c in df.columns if c not in table_cols]

    if missing_in_csv:
        print("WARNING: Table columns missing in CSV (will use NULL/default):", missing_in_csv)
    if extra_in_csv:
        print("INFO: CSV columns not in table (ignored):", extra_in_csv)

    df = df[insert_cols].copy()

    # Convert bigint-like columns to plain Python ints (avoid numpy.int64)
    bigint_cols = [c for c in insert_cols if c.lower() in BIGINT_COLS_CANDIDATES]
    for col in bigint_cols:
        # numeric coercion first, then Python int conversion
        df[col] = pd.to_numeric(df[col], errors="coerce")
        df[col] = df[col].apply(to_py_int_or_none)

    # Build INSERT
    col_list = ", ".join(f"[{c}]" for c in insert_cols)
    params = ", ".join("?" for _ in insert_cols)
    insert_sql = f"INSERT INTO {TABLE_NAME} ({col_list}) VALUES ({params})"

    # Insert
    rows = [tuple(r) for r in df.itertuples(index=False, name=None)]
    cursor.executemany(insert_sql, rows)

    conn.commit()
    cursor.close()
    conn.close()

    print(f"Inserted {len(rows)} rows into {TABLE_NAME}.")

if __name__ == "__main__":
    main()