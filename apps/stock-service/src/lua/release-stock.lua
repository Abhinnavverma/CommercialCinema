-- Atomic stock release. The mirror of decrement-stock.lua: it returns a previously
-- reserved quantity to the available pool in a single, indivisible step so a release
-- can never race a concurrent decrement.
--
-- KEYS[1] = stock:available:{itemId}
-- ARGV[1] = quantity to release (positive integer)
-- returns remaining stock after the release
--
-- Only an existing key is incremented. A missing key means the item was never tracked
-- in Redis (e.g. evicted), so we refuse to resurrect it at an arbitrary count and
-- return -1, letting the caller log the anomaly instead of silently creating stock.
local current = redis.call('GET', KEYS[1])
if current == false then
  return -1
end

local quantity = tonumber(ARGV[1])
return redis.call('INCRBY', KEYS[1], quantity)
