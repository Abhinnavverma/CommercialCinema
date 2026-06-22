-- Atomic stock decrement. Redis runs this whole script on its single thread, so the
-- GET-check-DECRBY sequence is indivisible: concurrent callers are serialized and can
-- never oversell (no read-modify-write race possible).
--
-- KEYS[1] = stock:available:{itemId}
-- ARGV[1] = quantity to decrement (positive integer)
-- returns { code, remaining }
--   code  1 = success      (remaining = stock after decrement)
--   code  0 = insufficient (remaining = current stock, unchanged)
--   code -1 = not found    (remaining = 0)
local current = redis.call('GET', KEYS[1])
if current == false then
  return { -1, 0 }
end

current = tonumber(current)
local quantity = tonumber(ARGV[1])

if current < quantity then
  return { 0, current }
end

return { 1, redis.call('DECRBY', KEYS[1], quantity) }
