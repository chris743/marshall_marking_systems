-- Run this SQL in your Supabase SQL Editor (Dashboard > SQL Editor > New Query)

-- Create the label_designer schema
CREATE SCHEMA IF NOT EXISTS label_designer;

-- Products table
CREATE TABLE IF NOT EXISTS label_designer.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_idx INTEGER,
  product_seq INTEGER,
  inactive BOOLEAN DEFAULT false,
  description TEXT NOT NULL,
  company_prefix VARCHAR(10),
  item_reference VARCHAR(10),
  indicator_digit VARCHAR(1) DEFAULT '0',
  external_upc VARCHAR(20),
  external_plu VARCHAR(20),
  gtin VARCHAR(14) NOT NULL,
  company_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast GTIN lookups
CREATE INDEX IF NOT EXISTS idx_products_gtin ON label_designer.products(gtin);

-- Full-text search index for description
CREATE INDEX IF NOT EXISTS idx_products_description ON label_designer.products USING gin(to_tsvector('english', description));

-- Templates table
CREATE TABLE IF NOT EXISTS label_designer.templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  elements JSONB NOT NULL,
  label_width INTEGER DEFAULT 812,
  label_height INTEGER DEFAULT 406,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for default template lookup
CREATE INDEX IF NOT EXISTS idx_templates_is_default ON label_designer.templates(is_default);

-- Variables table (template variables that users fill in at print time)
CREATE TABLE IF NOT EXISTS label_designer.variables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES label_designer.templates(id) ON DELETE CASCADE,
  key VARCHAR(50) NOT NULL,
  label VARCHAR(100) NOT NULL,
  default_value TEXT DEFAULT '',
  field_type VARCHAR(20) DEFAULT 'text', -- text, number, date, select
  options JSONB DEFAULT NULL, -- for select type: ["Option1", "Option2"]
  required BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(template_id, key)
);

-- Index for fast variable lookups by template
CREATE INDEX IF NOT EXISTS idx_variables_template_id ON label_designer.variables(template_id);

-- Printer configurations table (stores selected template, product, variables per printer)
CREATE TABLE IF NOT EXISTS label_designer.printer_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  printer_id VARCHAR(100) NOT NULL UNIQUE, -- local printer ID from server
  template_id UUID REFERENCES label_designer.templates(id) ON DELETE SET NULL,
  product_id UUID REFERENCES label_designer.products(id) ON DELETE SET NULL,
  lot_number VARCHAR(50) DEFAULT '',
  pack_date VARCHAR(20) DEFAULT '',
  variable_values JSONB DEFAULT '{}', -- custom variable values keyed by variable key
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast printer config lookups
CREATE INDEX IF NOT EXISTS idx_printer_configs_printer_id ON label_designer.printer_configs(printer_id);

-- Enable Row Level Security (RLS)
ALTER TABLE label_designer.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE label_designer.templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE label_designer.variables ENABLE ROW LEVEL SECURITY;
ALTER TABLE label_designer.printer_configs ENABLE ROW LEVEL SECURITY;

-- Allow public read access to products
CREATE POLICY "Allow public read access to products"
  ON label_designer.products FOR SELECT
  USING (true);

-- Allow public read/write access to templates
CREATE POLICY "Allow public read access to templates"
  ON label_designer.templates FOR SELECT
  USING (true);

CREATE POLICY "Allow public insert to templates"
  ON label_designer.templates FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public update to templates"
  ON label_designer.templates FOR UPDATE
  USING (true);

CREATE POLICY "Allow public delete to templates"
  ON label_designer.templates FOR DELETE
  USING (true);

-- Allow public CRUD access to variables
CREATE POLICY "Allow public read access to variables"
  ON label_designer.variables FOR SELECT
  USING (true);

CREATE POLICY "Allow public insert to variables"
  ON label_designer.variables FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public update to variables"
  ON label_designer.variables FOR UPDATE
  USING (true);

CREATE POLICY "Allow public delete to variables"
  ON label_designer.variables FOR DELETE
  USING (true);

-- Allow public CRUD access to printer_configs
CREATE POLICY "Allow public read access to printer_configs"
  ON label_designer.printer_configs FOR SELECT
  USING (true);

CREATE POLICY "Allow public insert to printer_configs"
  ON label_designer.printer_configs FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public update to printer_configs"
  ON label_designer.printer_configs FOR UPDATE
  USING (true);

CREATE POLICY "Allow public delete to printer_configs"
  ON label_designer.printer_configs FOR DELETE
  USING (true);

-- Allow public insert to products (for import script)
CREATE POLICY "Allow public insert to products"
  ON label_designer.products FOR INSERT
  WITH CHECK (true);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION label_designer.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
DROP TRIGGER IF EXISTS update_products_updated_at ON label_designer.products;
CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON label_designer.products
  FOR EACH ROW
  EXECUTE FUNCTION label_designer.update_updated_at_column();

DROP TRIGGER IF EXISTS update_templates_updated_at ON label_designer.templates;
CREATE TRIGGER update_templates_updated_at
  BEFORE UPDATE ON label_designer.templates
  FOR EACH ROW
  EXECUTE FUNCTION label_designer.update_updated_at_column();

DROP TRIGGER IF EXISTS update_variables_updated_at ON label_designer.variables;
CREATE TRIGGER update_variables_updated_at
  BEFORE UPDATE ON label_designer.variables
  FOR EACH ROW
  EXECUTE FUNCTION label_designer.update_updated_at_column();

DROP TRIGGER IF EXISTS update_printer_configs_updated_at ON label_designer.printer_configs;
CREATE TRIGGER update_printer_configs_updated_at
  BEFORE UPDATE ON label_designer.printer_configs
  FOR EACH ROW
  EXECUTE FUNCTION label_designer.update_updated_at_column();

-- Grant usage on the schema to anon and authenticated roles
GRANT USAGE ON SCHEMA label_designer TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA label_designer TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA label_designer TO anon, authenticated;
