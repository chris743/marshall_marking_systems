-- SQL Server setup script for Label Designer
-- Run this on RDGW-CF SQL Server instance
-- Uses DM02 database with labeling_ prefix on all tables

USE DM02;
GO

-- Products table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'labeling_products')
BEGIN
    CREATE TABLE labeling_products (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        product_idx INT NULL,
        product_seq INT NULL,
        inactive BIT DEFAULT 0,
        description NVARCHAR(500) NOT NULL,
        company_prefix VARCHAR(10) NULL,
        item_reference VARCHAR(10) NULL,
        indicator_digit VARCHAR(1) DEFAULT '0',
        external_upc VARCHAR(20) NULL,
        external_plu VARCHAR(20) NULL,
        gtin VARCHAR(14) NOT NULL,
        company_name NVARCHAR(255) NULL,
        created_at DATETIME2 DEFAULT GETDATE(),
        updated_at DATETIME2 DEFAULT GETDATE()
    );

    CREATE INDEX idx_labeling_products_gtin ON labeling_products(gtin);
    CREATE INDEX idx_labeling_products_description ON labeling_products(description);
END
GO

-- Templates table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'labeling_templates')
BEGIN
    CREATE TABLE labeling_templates (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        name NVARCHAR(100) NOT NULL,
        description NVARCHAR(500) NULL,
        folder NVARCHAR(100) NULL, -- Folder path for organization (NULL = root)
        elements NVARCHAR(MAX) NOT NULL, -- JSON stored as string
        label_width INT DEFAULT 812,
        label_height INT DEFAULT 406,
        is_default BIT DEFAULT 0,
        created_at DATETIME2 DEFAULT GETDATE(),
        updated_at DATETIME2 DEFAULT GETDATE()
    );

    CREATE INDEX idx_labeling_templates_folder ON labeling_templates(folder);
END
GO

-- Add folder column if table already exists (migration)
IF EXISTS (SELECT * FROM sys.tables WHERE name = 'labeling_templates')
   AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('labeling_templates') AND name = 'folder')
BEGIN
    ALTER TABLE labeling_templates ADD folder NVARCHAR(100) NULL;
    CREATE INDEX idx_labeling_templates_folder ON labeling_templates(folder);
END
GO

-- Variables table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'labeling_variables')
BEGIN
    CREATE TABLE labeling_variables (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        template_id UNIQUEIDENTIFIER NOT NULL,
        [key] VARCHAR(50) NOT NULL,
        label NVARCHAR(100) NOT NULL,
        default_value NVARCHAR(255) DEFAULT '',
        field_type VARCHAR(20) DEFAULT 'text',
        options NVARCHAR(MAX) NULL, -- JSON stored as string
        required BIT DEFAULT 0,
        sort_order INT DEFAULT 0,
        created_at DATETIME2 DEFAULT GETDATE(),
        updated_at DATETIME2 DEFAULT GETDATE(),
        CONSTRAINT FK_labeling_variables_template FOREIGN KEY (template_id) REFERENCES labeling_templates(id) ON DELETE CASCADE,
        CONSTRAINT UQ_labeling_variables_template_key UNIQUE (template_id, [key])
    );

    CREATE INDEX idx_labeling_variables_template_id ON labeling_variables(template_id);
END
GO

-- Printer configurations table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'labeling_printer_configs')
BEGIN
    CREATE TABLE labeling_printer_configs (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        printer_id VARCHAR(100) NOT NULL UNIQUE,
        template_id UNIQUEIDENTIFIER NULL,
        product_id UNIQUEIDENTIFIER NULL,
        lot_number VARCHAR(50) DEFAULT '',
        pack_date VARCHAR(20) DEFAULT '',
        variable_values NVARCHAR(MAX) DEFAULT '{}', -- JSON stored as string
        created_at DATETIME2 DEFAULT GETDATE(),
        updated_at DATETIME2 DEFAULT GETDATE(),
        CONSTRAINT FK_labeling_printer_configs_template FOREIGN KEY (template_id) REFERENCES labeling_templates(id) ON DELETE SET NULL,
        CONSTRAINT FK_labeling_printer_configs_product FOREIGN KEY (product_id) REFERENCES labeling_products(id) ON DELETE SET NULL
    );

    CREATE INDEX idx_labeling_printer_configs_printer_id ON labeling_printer_configs(printer_id);
END
GO

-- Trigger to update updated_at on labeling_products
IF EXISTS (SELECT * FROM sys.triggers WHERE name = 'trg_labeling_products_updated_at')
    DROP TRIGGER trg_labeling_products_updated_at;
GO

CREATE TRIGGER trg_labeling_products_updated_at
ON labeling_products
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE labeling_products
    SET updated_at = GETDATE()
    FROM labeling_products p
    INNER JOIN inserted i ON p.id = i.id;
END
GO

-- Trigger to update updated_at on labeling_templates
IF EXISTS (SELECT * FROM sys.triggers WHERE name = 'trg_labeling_templates_updated_at')
    DROP TRIGGER trg_labeling_templates_updated_at;
GO

CREATE TRIGGER trg_labeling_templates_updated_at
ON labeling_templates
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE labeling_templates
    SET updated_at = GETDATE()
    FROM labeling_templates t
    INNER JOIN inserted i ON t.id = i.id;
END
GO

-- Trigger to update updated_at on labeling_variables
IF EXISTS (SELECT * FROM sys.triggers WHERE name = 'trg_labeling_variables_updated_at')
    DROP TRIGGER trg_labeling_variables_updated_at;
GO

CREATE TRIGGER trg_labeling_variables_updated_at
ON labeling_variables
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE labeling_variables
    SET updated_at = GETDATE()
    FROM labeling_variables v
    INNER JOIN inserted i ON v.id = i.id;
END
GO

-- Trigger to update updated_at on labeling_printer_configs
IF EXISTS (SELECT * FROM sys.triggers WHERE name = 'trg_labeling_printer_configs_updated_at')
    DROP TRIGGER trg_labeling_printer_configs_updated_at;
GO

CREATE TRIGGER trg_labeling_printer_configs_updated_at
ON labeling_printer_configs
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE labeling_printer_configs
    SET updated_at = GETDATE()
    FROM labeling_printer_configs pc
    INNER JOIN inserted i ON pc.id = i.id;
END
GO

-- Scanners table (input devices that read license plates)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'labeling_scanners')
BEGIN
    CREATE TABLE labeling_scanners (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        name NVARCHAR(100) NOT NULL,
        description NVARCHAR(255) NULL,
        connection_type VARCHAR(20) DEFAULT 'serial', -- serial, network, usb
        connection_string NVARCHAR(255) NULL, -- COM port, IP:port, etc.
        enabled BIT DEFAULT 1,
        created_at DATETIME2 DEFAULT GETDATE(),
        updated_at DATETIME2 DEFAULT GETDATE()
    );
END
GO

-- Scan locations table (print positions for each scanner, e.g. 4 per scanner)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'labeling_scan_locations')
BEGIN
    CREATE TABLE labeling_scan_locations (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        scanner_id UNIQUEIDENTIFIER NOT NULL,
        location_number INT NOT NULL, -- 1, 2, 3, 4
        name NVARCHAR(100) NOT NULL, -- e.g. "Top Label", "Side Label", "Case Label"
        printer_id VARCHAR(100) NULL, -- Reference to physical printer
        enabled BIT DEFAULT 1,
        created_at DATETIME2 DEFAULT GETDATE(),
        updated_at DATETIME2 DEFAULT GETDATE(),
        CONSTRAINT FK_labeling_scan_locations_scanner FOREIGN KEY (scanner_id) REFERENCES labeling_scanners(id) ON DELETE CASCADE,
        CONSTRAINT UQ_labeling_scan_locations_scanner_number UNIQUE (scanner_id, location_number)
    );

    CREATE INDEX idx_labeling_scan_locations_scanner_id ON labeling_scan_locations(scanner_id);
END
GO

-- License plate configs (maps license plate code + location to what gets printed)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'labeling_license_plate_configs')
BEGIN
    CREATE TABLE labeling_license_plate_configs (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        license_plate_code VARCHAR(50) NOT NULL, -- The scanned code (e.g. "A1", "B2")
        location_id UNIQUEIDENTIFIER NOT NULL,
        template_id UNIQUEIDENTIFIER NULL,
        product_id UNIQUEIDENTIFIER NULL,
        copies INT DEFAULT 1,
        lot_number VARCHAR(50) DEFAULT '',
        pack_date VARCHAR(20) DEFAULT '',
        variable_values NVARCHAR(MAX) DEFAULT '{}', -- JSON stored as string
        enabled BIT DEFAULT 1,
        created_at DATETIME2 DEFAULT GETDATE(),
        updated_at DATETIME2 DEFAULT GETDATE(),
        CONSTRAINT FK_labeling_lp_configs_location FOREIGN KEY (location_id) REFERENCES labeling_scan_locations(id) ON DELETE CASCADE,
        CONSTRAINT FK_labeling_lp_configs_template FOREIGN KEY (template_id) REFERENCES labeling_templates(id) ON DELETE SET NULL,
        CONSTRAINT FK_labeling_lp_configs_product FOREIGN KEY (product_id) REFERENCES labeling_products(id) ON DELETE SET NULL,
        CONSTRAINT UQ_labeling_lp_configs_code_location UNIQUE (license_plate_code, location_id)
    );

    CREATE INDEX idx_labeling_lp_configs_code ON labeling_license_plate_configs(license_plate_code);
    CREATE INDEX idx_labeling_lp_configs_location_id ON labeling_license_plate_configs(location_id);
END
GO

-- Add columns if table already exists (migration)
IF EXISTS (SELECT * FROM sys.tables WHERE name = 'labeling_license_plate_configs')
   AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('labeling_license_plate_configs') AND name = 'lot_number')
BEGIN
    ALTER TABLE labeling_license_plate_configs ADD lot_number VARCHAR(50) DEFAULT '';
    ALTER TABLE labeling_license_plate_configs ADD pack_date VARCHAR(20) DEFAULT '';
    ALTER TABLE labeling_license_plate_configs ADD variable_values NVARCHAR(MAX) DEFAULT '{}';
END
GO

-- Scan event log (audit trail of scans and prints)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'labeling_scan_events')
BEGIN
    CREATE TABLE labeling_scan_events (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        scanner_id UNIQUEIDENTIFIER NOT NULL,
        license_plate_code VARCHAR(50) NOT NULL,
        scanned_at DATETIME2 DEFAULT GETDATE(),
        labels_printed INT DEFAULT 0,
        status VARCHAR(20) DEFAULT 'success', -- success, partial, failed, no_config
        error_message NVARCHAR(500) NULL,
        CONSTRAINT FK_labeling_scan_events_scanner FOREIGN KEY (scanner_id) REFERENCES labeling_scanners(id) ON DELETE CASCADE
    );

    CREATE INDEX idx_labeling_scan_events_scanner_id ON labeling_scan_events(scanner_id);
    CREATE INDEX idx_labeling_scan_events_scanned_at ON labeling_scan_events(scanned_at);
    CREATE INDEX idx_labeling_scan_events_code ON labeling_scan_events(license_plate_code);
END
GO

-- Trigger for labeling_scanners updated_at
IF EXISTS (SELECT * FROM sys.triggers WHERE name = 'trg_labeling_scanners_updated_at')
    DROP TRIGGER trg_labeling_scanners_updated_at;
GO

CREATE TRIGGER trg_labeling_scanners_updated_at
ON labeling_scanners
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE labeling_scanners
    SET updated_at = GETDATE()
    FROM labeling_scanners s
    INNER JOIN inserted i ON s.id = i.id;
END
GO

-- Trigger for labeling_scan_locations updated_at
IF EXISTS (SELECT * FROM sys.triggers WHERE name = 'trg_labeling_scan_locations_updated_at')
    DROP TRIGGER trg_labeling_scan_locations_updated_at;
GO

CREATE TRIGGER trg_labeling_scan_locations_updated_at
ON labeling_scan_locations
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE labeling_scan_locations
    SET updated_at = GETDATE()
    FROM labeling_scan_locations sl
    INNER JOIN inserted i ON sl.id = i.id;
END
GO

-- Trigger for labeling_license_plate_configs updated_at
IF EXISTS (SELECT * FROM sys.triggers WHERE name = 'trg_labeling_lp_configs_updated_at')
    DROP TRIGGER trg_labeling_lp_configs_updated_at;
GO

CREATE TRIGGER trg_labeling_lp_configs_updated_at
ON labeling_license_plate_configs
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE labeling_license_plate_configs
    SET updated_at = GETDATE()
    FROM labeling_license_plate_configs lpc
    INNER JOIN inserted i ON lpc.id = i.id;
END
GO

-- Add pack_date_format and pack_date_offset columns to labeling_license_plate_configs (migration)
IF EXISTS (SELECT * FROM sys.tables WHERE name = 'labeling_license_plate_configs')
   AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('labeling_license_plate_configs') AND name = 'pack_date_format')
BEGIN
    ALTER TABLE labeling_license_plate_configs ADD pack_date_format VARCHAR(20) DEFAULT 'YYMMDD';
    ALTER TABLE labeling_license_plate_configs ADD pack_date_offset INT DEFAULT 0;
END
GO

-- Add pack_date_format and pack_date_offset columns to labeling_printer_configs (migration)
IF EXISTS (SELECT * FROM sys.tables WHERE name = 'labeling_printer_configs')
   AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('labeling_printer_configs') AND name = 'pack_date_format')
BEGIN
    ALTER TABLE labeling_printer_configs ADD pack_date_format VARCHAR(20) DEFAULT 'YYMMDD';
    ALTER TABLE labeling_printer_configs ADD pack_date_offset INT DEFAULT 0;
END
GO

PRINT 'DM02 labeling tables setup complete!';
