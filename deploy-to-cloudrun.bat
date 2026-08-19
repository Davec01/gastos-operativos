@echo off
REM Script para desplegar a Cloud Run

echo ========================================
echo Desplegando a Cloud Run
echo ========================================
echo.

REM Asegúrate de estar autenticado en gcloud
gcloud auth login

REM Configurar proyecto
gcloud config set project viacotur-saas

REM Desplegar
gcloud run deploy gastos-operativos ^
  --source . ^
  --region=southamerica-west1 ^
  --allow-unauthenticated ^
  --platform=managed ^
  --timeout=300

echo.
echo ========================================
echo Despliegue completado
echo ========================================
pause
