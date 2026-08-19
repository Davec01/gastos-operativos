#!/bin/bash

echo "========================================"
echo "Migración: Agregar campos de vehículo"
echo "========================================"
echo ""

PGPASSWORD=viacotur_pass psql -h 34.174.97.159 -U viacotur -d viacotur -p 5432 -f migrations/add_vehiculo_tracking.sql

echo ""
echo "========================================"
echo "Migración completada"
echo "========================================"
