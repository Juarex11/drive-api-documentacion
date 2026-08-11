-- ==========================================================
-- Ejecuta este script en SSMS (o via sqlcmd) UNA sola vez.
-- Crea la base de datos (si no existe) y la tabla Uploads,
-- que funciona a la vez como registro de estado y como cola
-- de trabajos (patron "job table" con polling).
-- ==========================================================

IF DB_ID('UploadSystem') IS NULL
BEGIN
    CREATE DATABASE UploadSystem;
END
GO

USE UploadSystem;
GO

IF OBJECT_ID('dbo.Uploads', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Uploads (
        Id              INT IDENTITY(1,1) PRIMARY KEY,
        FilePath        NVARCHAR(500)   NOT NULL,
        FileName        NVARCHAR(255)   NOT NULL,
        FileSize        BIGINT          NOT NULL,
        FileOffset      BIGINT          NOT NULL DEFAULT 0,
        SessionUri      NVARCHAR(1000)  NULL,
        SessionCreatedAt DATETIME2      NULL,

        -- pending -> uploading -> labeling -> completed
        --                      -> failed (con posibilidad de reintento manual)
        Status          NVARCHAR(20)    NOT NULL DEFAULT 'pending',

        RetryCount      INT             NOT NULL DEFAULT 0,
        LastError       NVARCHAR(MAX)   NULL,

        DriveFileId     NVARCHAR(200)   NULL,
        LabelApplied    BIT             NOT NULL DEFAULT 0,

        -- Se usa para que un worker "reclame" el trabajo sin que
        -- otro worker en paralelo lo tome tambien (evita duplicados).
        LockedBy        NVARCHAR(100)   NULL,
        LockedAt        DATETIME2       NULL,

        CreatedAt       DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME(),
        UpdatedAt       DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME()
    );

    CREATE INDEX IX_Uploads_Status ON dbo.Uploads(Status);
END
GO
