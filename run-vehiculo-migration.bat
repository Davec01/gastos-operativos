@echo off
echo ========================================
echo Migracion: Agregar campos de vehiculo
echo ========================================
echo.

psql -h 34.174.97.159 -U viacotur -d viacotur -p 5432 -f migrations/add_vehiculo_tracking.sql

echo.
echo ========================================
echo Migracion completada
echo ========================================
pause
