-- Sample data for Farmacia Solidaria

-- Insert sample products
INSERT INTO public.products (name, description, barcode, price, stock_quantity, min_stock_level, category) VALUES
('Paracetamol 500mg', 'Analgésico y antipirético', '7501234567890', 15.50, 100, 20, 'Analgésicos'),
('Ibuprofeno 400mg', 'Antiinflamatorio no esteroideo', '7501234567891', 22.00, 80, 15, 'Antiinflamatorios'),
('Amoxicilina 500mg', 'Antibiótico de amplio espectro', '7501234567892', 45.00, 50, 10, 'Antibióticos'),
('Loratadina 10mg', 'Antihistamínico para alergias', '7501234567893', 18.75, 60, 12, 'Antihistamínicos'),
('Omeprazol 20mg', 'Inhibidor de la bomba de protones', '7501234567894', 35.00, 40, 8, 'Gastroenterología'),
('Vitamina C 1000mg', 'Suplemento vitamínico', '7501234567895', 25.00, 75, 15, 'Vitaminas'),
('Alcohol 70%', 'Antiséptico para uso externo', '7501234567896', 12.00, 120, 25, 'Antisépticos'),
('Gasas estériles', 'Material de curación', '7501234567897', 8.50, 200, 30, 'Material de curación'),
('Termómetro digital', 'Medición de temperatura corporal', '7501234567898', 85.00, 25, 5, 'Instrumentos'),
('Jarabe para la tos', 'Expectorante natural', '7501234567899', 28.00, 45, 10, 'Jarabes');
