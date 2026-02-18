-- ============================================================
-- Groups Feature Migration
-- Creates labeling_location_codes, labeling_groups,
--        labeling_group_configs, labeling_group_scanners
-- ============================================================

-- 1. labeling_location_codes
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'labeling_location_codes')
BEGIN
    CREATE TABLE labeling_location_codes (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        code VARCHAR(50) NOT NULL,
        description NVARCHAR(200) NULL,
        enabled BIT NOT NULL DEFAULT 1,
        created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
        updated_at DATETIME2 NOT NULL DEFAULT GETDATE(),

        CONSTRAINT UQ_location_codes_code UNIQUE (code)
    );
END
GO

IF NOT EXISTS (SELECT * FROM sys.triggers WHERE name = 'trg_labeling_location_codes_updated_at')
BEGIN
    EXEC('
    CREATE TRIGGER trg_labeling_location_codes_updated_at
    ON labeling_location_codes
    AFTER UPDATE
    AS
    BEGIN
        SET NOCOUNT ON;
        UPDATE labeling_location_codes
        SET updated_at = GETDATE()
        FROM labeling_location_codes lc
        INNER JOIN inserted i ON lc.id = i.id;
    END
    ');
END
GO

-- 2. labeling_groups
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'labeling_groups')
BEGIN
    CREATE TABLE labeling_groups (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        name NVARCHAR(100) NOT NULL,
        description NVARCHAR(500) NULL,
        printer_id VARCHAR(50) NULL,
        enabled BIT NOT NULL DEFAULT 1,
        created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
        updated_at DATETIME2 NOT NULL DEFAULT GETDATE()
    );
END
GO

-- Add printer_id column if table already existed without it
IF EXISTS (SELECT * FROM sys.tables WHERE name = 'labeling_groups')
   AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('labeling_groups') AND name = 'printer_id')
BEGIN
    ALTER TABLE labeling_groups ADD printer_id VARCHAR(50) NULL;
END
GO

IF NOT EXISTS (SELECT * FROM sys.triggers WHERE name = 'trg_labeling_groups_updated_at')
BEGIN
    EXEC('
    CREATE TRIGGER trg_labeling_groups_updated_at
    ON labeling_groups
    AFTER UPDATE
    AS
    BEGIN
        SET NOCOUNT ON;
        UPDATE labeling_groups
        SET updated_at = GETDATE()
        FROM labeling_groups g
        INNER JOIN inserted i ON g.id = i.id;
    END
    ');
END
GO

-- 3. labeling_group_configs
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'labeling_group_configs')
BEGIN
    CREATE TABLE labeling_group_configs (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        group_id UNIQUEIDENTIFIER NOT NULL,
        location_code_id UNIQUEIDENTIFIER NOT NULL,
        template_id UNIQUEIDENTIFIER NULL,
        product_id UNIQUEIDENTIFIER NULL,
        copies INT NOT NULL DEFAULT 1,
        lot_number VARCHAR(100) NULL DEFAULT '',
        pack_date VARCHAR(50) NULL DEFAULT '',
        pack_date_format VARCHAR(20) NULL DEFAULT 'YYMMDD',
        pack_date_offset INT NULL DEFAULT 0,
        variable_values NVARCHAR(MAX) NULL DEFAULT '{}',
        enabled BIT NOT NULL DEFAULT 1,
        created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
        updated_at DATETIME2 NOT NULL DEFAULT GETDATE(),

        CONSTRAINT FK_group_configs_group FOREIGN KEY (group_id)
            REFERENCES labeling_groups(id) ON DELETE CASCADE,
        CONSTRAINT FK_group_configs_location_code FOREIGN KEY (location_code_id)
            REFERENCES labeling_location_codes(id),
        CONSTRAINT FK_group_configs_template FOREIGN KEY (template_id)
            REFERENCES labeling_templates(id) ON DELETE SET NULL,
        CONSTRAINT UQ_group_configs_code UNIQUE (group_id, location_code_id)
    );
END
GO

IF NOT EXISTS (SELECT * FROM sys.triggers WHERE name = 'trg_labeling_group_configs_updated_at')
BEGIN
    EXEC('
    CREATE TRIGGER trg_labeling_group_configs_updated_at
    ON labeling_group_configs
    AFTER UPDATE
    AS
    BEGIN
        SET NOCOUNT ON;
        UPDATE labeling_group_configs
        SET updated_at = GETDATE()
        FROM labeling_group_configs gc
        INNER JOIN inserted i ON gc.id = i.id;
    END
    ');
END
GO

-- 4. labeling_group_scanners (which scanners trigger this group)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'labeling_group_scanners')
BEGIN
    CREATE TABLE labeling_group_scanners (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        group_id UNIQUEIDENTIFIER NOT NULL,
        scanner_id UNIQUEIDENTIFIER NOT NULL,

        CONSTRAINT FK_group_scanners_group FOREIGN KEY (group_id)
            REFERENCES labeling_groups(id) ON DELETE CASCADE,
        CONSTRAINT FK_group_scanners_scanner FOREIGN KEY (scanner_id)
            REFERENCES labeling_scanners(id) ON DELETE CASCADE,
        CONSTRAINT UQ_group_scanner UNIQUE (group_id, scanner_id)
    );
END
GO
