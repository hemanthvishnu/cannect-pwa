# Migrations Archive

This folder contains the historical migration files that were consolidated 
into `../consolidated_schema.sql` on December 24, 2025.

## Why Archive?

Over 7 days of rapid development, 63 migration files accumulated, many being
hotfixes and incremental changes. This made the migration history difficult
to understand and maintain.

## Files Archived

- 63 migration files from December 16-24, 2025
- Original files preserved for reference and rollback capability
- All migrations were applied to production before archiving

## Consolidated Schema

The `../consolidated_schema.sql` file contains:
- All tables with current column definitions
- All indexes
- All RLS policies  
- All trigger functions
- All triggers

## For New Deployments

Use `consolidated_schema.sql` for setting up fresh databases.
The migrations folder remains for incremental changes going forward.

## Note

These files are kept in version control for historical reference but are
no longer needed for database operations. Future migrations should be
minimal and atomic.
