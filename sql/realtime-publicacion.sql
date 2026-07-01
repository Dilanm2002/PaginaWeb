-- Habilitar Realtime para las tablas que necesitan actualizaciones en vivo.
-- Ejecutar en Supabase → SQL Editor (una sola vez).
--
-- Sin esto, los canales db.channel('realtime-stock') y 'realtime-pedidos'
-- se suscriben pero nunca reciben eventos porque las tablas no están
-- en la publicación de Postgres que usa Supabase Realtime.

ALTER PUBLICATION supabase_realtime ADD TABLE pedidos;
ALTER PUBLICATION supabase_realtime ADD TABLE productos;
ALTER PUBLICATION supabase_realtime ADD TABLE gastos;
ALTER PUBLICATION supabase_realtime ADD TABLE mensajes;

-- REPLICA IDENTITY FULL: necesario para que los eventos UPDATE en productos
-- disparen correctamente el canal realtime-stock (sin esto Supabase puede
-- omitir eventos UPDATE si la tabla no tiene PK o tiene configuración default).
ALTER TABLE productos REPLICA IDENTITY FULL;
ALTER TABLE pedidos   REPLICA IDENTITY FULL;
