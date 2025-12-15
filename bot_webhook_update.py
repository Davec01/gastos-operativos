# Actualización para bot_unificado.py
# Agregar esta función modificada para handle_location

async def handle_location(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """
    FORMULARIO: si form_loc_pending[chat_id] == True
      - Inserta en ubicaciones_telegram
      - Llama al webhook de Next.js para actualizar gastos_operacionales
      - Notifica a Next /api/elastic
    CONDUCTOR: si tracking_flags[chat_id] == True (y no estamos en modo formulario)
      - Inserta en ubicacion_conductor
      - Indexa directo en Elasticsearch (ubicacion_conductor)
    Otro caso:
      - Explica qué hacer
    """
    chat_id = update.effective_chat.id
    lat = update.message.location.latitude
    lon = update.message.location.longitude

    logger.info("📍 Ubicación de %s: %s, %s", chat_id, lat, lon)

    # 1) FORMULARIO
    if form_loc_pending.get(chat_id, False):
        try:
            # Guardar en ubicaciones_telegram (tabla histórica)
            with psycopg2.connect(**DB_CONFIG) as conn, conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO public.ubicaciones_telegram (telegram_id, lat, lon) VALUES (%s, %s, %s)",
                    (chat_id, lat, lon),
                )
                conn.commit()

            # NUEVO: Llamar al webhook de Next.js para actualizar coordenadas
            try:
                # URL del webhook en Cloud Run
                webhook_url = f"{URL_GASTOS_OPERATIVOS}/api/actualizar-coordenadas"

                logger.info("Llamando webhook: %s", webhook_url)

                async with httpx.AsyncClient(timeout=15.0) as client:
                    response = await client.post(
                        webhook_url,
                        json={
                            "telegram_id": str(chat_id),
                            "lat": lat,
                            "lon": lon
                        },
                        headers={"Content-Type": "application/json"}
                    )

                    if response.status_code == 200:
                        result = response.json()
                        logger.info("✅ Coordenadas enviadas a Next.js: %s", result)

                        # Mensaje de éxito con detalles
                        records_updated = result.get('data', {}).get('records_updated', 0)
                        await update.message.reply_text(
                            f"✅ Ubicación asociada al formulario correctamente.\n"
                            f"Gastos actualizados: {records_updated}",
                            reply_markup=main_menu_keyboard()
                        )
                    else:
                        error_body = response.json() if response.headers.get('content-type') == 'application/json' else response.text
                        logger.warning("⚠️ Error del webhook (%s): %s", response.status_code, error_body)

                        # Mostrar mensaje de error específico al usuario
                        error_hint = error_body.get('hint', '') if isinstance(error_body, dict) else ''
                        await update.message.reply_text(
                            f"⚠️ {error_body.get('error', 'No se pudo asociar al formulario')}\n"
                            f"{error_hint}",
                            reply_markup=main_menu_keyboard()
                        )

            except httpx.TimeoutException:
                logger.error("Timeout llamando webhook")
                await update.message.reply_text(
                    "⚠️ Tiempo de espera agotado. La ubicación se sincronizará automáticamente.",
                    reply_markup=main_menu_keyboard()
                )
            except Exception as e:
                logger.error("Error llamando webhook: %s", e)
                await update.message.reply_text(
                    "⚠️ Ubicación guardada localmente, se sincronizará automáticamente en breve.",
                    reply_markup=main_menu_keyboard()
                )

            # También notificar a Elasticsearch (opcional, ya que el webhook lo hace)
            try:
                await notify_next_gastos({"telegram_id": chat_id, "minutes": 60})
            except Exception as e:
                logger.warning("No se pudo sincronizar con ES (gastos): %s", e)

            form_loc_pending[chat_id] = False
            return

        except Exception as e:
            logger.exception("Error procesando ubicación (FORMULARIO)")
            await update.message.reply_text("⚠️ Error asociando ubicación. Intenta de nuevo.")
            return

    # 2) CONDUCTOR
    if tracking_flags.get(chat_id, False):
        try:
            with psycopg2.connect(**DB_CONFIG) as conn, conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO public.ubicacion_conductor (telegram_id, lat, lon) VALUES (%s, %s, %s)",
                    (chat_id, lat, lon),
                )
                conn.commit()

            # Indexar en ES directo
            try:
                ts_iso = dt.datetime.now(dt.timezone.utc).isoformat()
                await es_index_conductor(chat_id, lat, lon, ts_iso)
            except Exception as e:
                logger.warning("No se pudo indexar ubicacion_conductor en ES: %s", e)

            await update.message.reply_text(
                "✅ Ubicación de conductor registrada.",
                reply_markup=tracking_location_keyboard()
            )
            return
        except Exception as e:
            logger.exception("Error procesando ubicación (CONDUCTOR)")
            await update.message.reply_text("⚠️ Error guardando ubicación de conductor. Intenta de nuevo.")
            return

    # 3) Sin contexto claro
    await update.message.reply_text(
        "¿Para qué es esta ubicación?\n\n"
        "• Si es para **Gastos Operativos**, primero entra a **🧾 Formularios** y luego toca Enviar ubicación.\n"
        "• Si es para **seguimiento de conductor**, activa **📍 Mandar ubicación**.",
        reply_markup=main_menu_keyboard()
    )
