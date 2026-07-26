--- @class Spawnport
--- 出生点接口 Spawnport
local Spawnport = {}
_G.Spawnport = Spawnport

--- 获取默认出生点
--- @return number @成功返回 ErrorCode.OK
--- @return number @x 坐标
--- @return number @y 坐标
--- @return number @z 坐标
function Spawnport:getSpawnPoint() return 0, 0, 0, 0 end

--- 设置出生点位置
--- @param x number @x 坐标
--- @param y number @y 坐标
--- @param z number @z 坐标
--- @return number @成功返回 ErrorCode.OK
function Spawnport:setSpawnPoint(x, y, z) return 0 end

--- 获取区块有效刷新点，可作为出生点
--- @param x number @区块 x 坐标
--- @param y number @区块 y 坐标
--- @param z number @区块 z 坐标
--- @return number @成功返回 ErrorCode.OK
--- @return number @x 坐标
--- @return number @y 坐标
--- @return number @z 坐标
function Spawnport:getChunkValidSpawnPos(x, y, z) return 0, 0, 0, 0 end
