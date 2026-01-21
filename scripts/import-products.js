#!/usr/bin/env node
/**
 * Import products from fullgtin list.csv into Supabase
 * Usage: node scripts/import-products.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const fs = require('fs');
const csv = require('csv-parser');
const { supabase } = require('../supabaseClient');

const CSV_FILE = path.join(__dirname, '..', 'fullgtin list.csv');
const BATCH_SIZE = 500; // Insert in batches for better performance

async function importProducts() {
  if (!supabase) {
    console.error('Error: Supabase client not configured.');
    console.error('Please set SUPABASE_URL and SUPABASE_ANON_KEY in .env file');
    process.exit(1);
  }

  console.log(`Reading CSV file: ${CSV_FILE}`);

  if (!fs.existsSync(CSV_FILE)) {
    console.error(`Error: CSV file not found at ${CSV_FILE}`);
    process.exit(1);
  }

  const products = [];
  let rowCount = 0;

  return new Promise((resolve, reject) => {
    fs.createReadStream(CSV_FILE)
      .pipe(csv())
      .on('data', (row) => {
        rowCount++;

        // Map CSV columns to database columns
        const product = {
          product_idx: parseInt(row.productidx) || null,
          product_seq: parseInt(row.productseq) || null,
          inactive: row.inactiveflag === 'Y',
          description: row.descr || row.name || '',
          company_prefix: row.casecompanyprefix || '',
          item_reference: row.caseitemreference || '',
          indicator_digit: row.caseindicatordigit || '0',
          external_upc: row.externalupc || null,
          external_plu: row.externalplu || null,
          gtin: row.gtin || '',
          company_name: row.ascompanyname || '',
        };

        // Skip rows without GTIN or description
        if (product.gtin && product.description) {
          products.push(product);
        }

        // Log progress every 1000 rows
        if (rowCount % 1000 === 0) {
          console.log(`Processed ${rowCount} rows...`);
        }
      })
      .on('end', async () => {
        console.log(`\nCSV parsing complete. ${products.length} valid products found out of ${rowCount} rows.`);

        // Insert in batches
        let inserted = 0;
        let errors = 0;

        for (let i = 0; i < products.length; i += BATCH_SIZE) {
          const batch = products.slice(i, i + BATCH_SIZE);

          try {
            const { data, error } = await supabase
              .from('products')
              .upsert(batch, {
                onConflict: 'gtin,description',
                ignoreDuplicates: true
              });

            if (error) {
              // If upsert fails, try regular insert
              const { error: insertError } = await supabase
                .from('products')
                .insert(batch);

              if (insertError) {
                console.error(`Batch ${Math.floor(i / BATCH_SIZE) + 1} error:`, insertError.message);
                errors += batch.length;
              } else {
                inserted += batch.length;
              }
            } else {
              inserted += batch.length;
            }
          } catch (err) {
            console.error(`Batch ${Math.floor(i / BATCH_SIZE) + 1} exception:`, err.message);
            errors += batch.length;
          }

          // Progress update
          const progress = Math.round(((i + batch.length) / products.length) * 100);
          process.stdout.write(`\rInserting: ${progress}% (${inserted} inserted, ${errors} errors)`);
        }

        console.log(`\n\nImport complete!`);
        console.log(`  Total rows processed: ${rowCount}`);
        console.log(`  Products inserted: ${inserted}`);
        console.log(`  Errors: ${errors}`);

        resolve({ inserted, errors, total: rowCount });
      })
      .on('error', (err) => {
        console.error('CSV parsing error:', err);
        reject(err);
      });
  });
}

// Run import
importProducts()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Import failed:', err);
    process.exit(1);
  });
