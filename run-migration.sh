#!/bin/bash
# Script para ejecutar la migración de base de datos
# Asegúrate de tener psql instalado y configurado

echo "========================================"
echo "Ejecutando migración de base de datos"
echo "========================================"
echo

# Configuración de la base de datos
export PGHOST=34.174.97.159
export PGPORT=5432
export PGDATABASE=viacotur

echo "Conectando a: $PGHOST:$PGPORT/$PGDATABASE"
echo
echo "Por favor ingresa tu usuario de PostgreSQL cuando se solicite"
echo

psql -h $PGHOST -p $PGPORT -d $PGDATABASE -f migrations/add_odoo_tracking.sql

echo
echo "========================================"
echo "Migración completada"
echo "========================================"
