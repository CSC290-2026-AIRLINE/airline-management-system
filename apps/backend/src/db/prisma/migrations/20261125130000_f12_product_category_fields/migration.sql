UPDATE product
SET type_code = 'STD', is_premium = FALSE
WHERE category <> 'meal' AND (type_code <> 'STD' OR is_premium);

DELETE FROM product_dietary AS dietary
USING product
WHERE dietary.product_id = product.id AND product.category = 'duty_free';

ALTER TABLE product ADD CONSTRAINT product_meal_fields_check
  CHECK (category = 'meal' OR (type_code = 'STD' AND NOT is_premium));
