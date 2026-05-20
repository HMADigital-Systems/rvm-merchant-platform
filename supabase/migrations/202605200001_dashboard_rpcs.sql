-- Dashboard RPCs: Sum from users table
CREATE OR REPLACE FUNCTION public.get_total_weight(merchant_uuid UUID DEFAULT NULL)
RETURNS NUMERIC
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE result NUMERIC;
BEGIN
  SELECT COALESCE(SUM(total_weight), 0) INTO result FROM public.users;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_total_points(merchant_uuid UUID DEFAULT NULL)
RETURNS NUMERIC
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE result NUMERIC;
BEGIN
  SELECT COALESCE(SUM(total_points), 0) INTO result FROM public.users;
  RETURN result;
END;
$$;

SELECT '✅ Dashboard RPCs: get_total_weight, get_total_points' AS result;
