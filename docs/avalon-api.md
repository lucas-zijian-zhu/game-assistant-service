# 阿瓦隆助手后端接口文档

本文档描述当前 NestJS 后端 MVP 的实际接口行为。

## 基本信息

- 本地服务地址：`http://localhost:3000`
- Base URL：`/api`
- WebSocket：`ws://localhost:3000/ws/rooms/{roomCode}?playerId={playerId}`
- 请求格式：`Content-Type: application/json`
- 当前玩家标识：部分查询接口通过请求头 `X-Player-Id` 返回当前玩家可见身份信息。
- 当前存储：内存存储，服务重启后房间和对局数据会丢失。
- 空房间自动关闭：房间内所有 WebSocket 连接断开后，默认 60 秒内无人重连则自动关闭。可通过环境变量 `AVALON_EMPTY_ROOM_CLOSE_DELAY_MS` 配置毫秒数。

## 通用错误格式

```json
{
  "code": "ROOM_NOT_FOUND",
  "message": "房间不存在。"
}
```

常见错误码：

| 错误码 | HTTP 状态 | 说明 |
| --- | --- | --- |
| `ROOM_NOT_FOUND` | 404 | 房间不存在 |
| `ROOM_NOT_JOINABLE` | 409 | 房间已开始或不可加入 |
| `ROOM_FULL` | 409 | 房间人数已满 |
| `PLAYER_NOT_FOUND` | 404 | 玩家不存在或不在房间内 |
| `ONLY_HOST_ALLOWED` | 403 | 只有房主可以操作 |
| `ONLY_LEADER_ALLOWED` | 403 | 只有当前队长或指定角色可以操作 |
| `INVALID_ROLE_CONFIG` | 400 | 角色配置无效 |
| `PLAYERS_NOT_READY` | 409 | 玩家未全部准备或人数不足 |
| `GAME_ALREADY_STARTED` | 409 | 对局已经开始 |
| `INVALID_GAME_PHASE` | 409 | 当前阶段不允许该操作 |
| `INVALID_TEAM_SIZE` | 400 | 出任务人数不符合当前轮次要求 |
| `DUPLICATE_VOTE` | 409 | 当前轮次已经投过票 |
| `MISSION_VOTER_NOT_IN_TEAM` | 403 | 非出任务玩家不能提交任务票 |
| `GOOD_PLAYER_CANNOT_FAIL` | 403 | 好人阵营不能提交失败票 |

## 枚举

### RoomStatus

`lobby`、`playing`、`finished`、`closed`

### GamePhase

`not_started`、`role_reveal`、`speech`、`team_building`、`team_vote`、`mission_vote`、`round_result`、`assassination`、`finished`

### VoteStatus

`pending`、`submitted`

### TeamVote

`approve`、`reject`

### MissionVote

`success`、`fail`

### RoundHistoryStatus

| 值 | 说明 |
| --- | --- |
| `team_rejected` | 队伍投票未通过，只表示本次组队被否决，不算任务失败 |
| `mission_pending` | 队伍已通过或第 5 次强制出任务，等待任务投票 |
| `mission_succeeded` | 任务投票已结算，任务成功 |
| `mission_failed` | 任务投票已结算，任务失败 |

## 角色

当前支持角色：

| roleId | 名称 | 阵营 |
| --- | --- | --- |
| `merlin` | 梅林 | good |
| `percival` | 派西维尔 | good |
| `loyal` | 忠臣 | good |
| `assassin` | 刺客 | evil |
| `morgana` | 莫甘娜 | evil |
| `mordred` | 莫德雷德 | evil |
| `oberon` | 奥伯伦 | evil |
| `minion` | 爪牙 | evil |

## 数据结构

### RoleConfigItem

```json
{
  "roleId": "merlin",
  "count": 1
}
```

### Player

```json
{
  "id": "p_001",
  "name": "小王",
  "seat": 1,
  "isHost": true,
  "isReady": true,
  "connected": true
}
```

### Room

```json
{
  "id": "room_001",
  "code": "A1B2C3",
  "status": "lobby",
  "playerCount": 5,
  "roleConfig": [],
  "players": [],
  "createdAt": "2026-04-29T22:00:00.000Z"
}
```

### GameState

```json
{
  "roomId": "room_001",
  "phase": "team_vote",
  "round": 1,
  "teamVoteAttempt": 1,
  "leaderPlayerId": "p_001",
  "teamPlayerIds": ["p_001", "p_003"],
  "teamVoteProgress": {
    "required": 5,
    "submitted": 2,
    "players": {
      "p_001": "submitted",
      "p_002": "pending"
    }
  },
  "missionVoteProgress": {
    "required": 0,
    "submitted": 0,
    "players": {}
  },
  "history": [],
  "winner": null,
  "updatedAt": "2026-04-29T22:05:00.000Z"
}
```

### RoundResult

`game.history` 和 `round.result` 使用该结构。队伍票会在结算后公开每个玩家的选择；任务票只公开统计，不公开个人明细。

```json
{
  "round": 1,
  "status": "team_rejected",
  "leaderPlayerId": "p_001",
  "teamPlayerIds": ["p_001", "p_003"],
  "teamVoteResult": {
    "approveCount": 2,
    "rejectCount": 3,
    "passed": false,
    "votes": {
      "p_001": "approve",
      "p_002": "reject",
      "p_003": "approve",
      "p_004": "reject",
      "p_005": "reject"
    }
  }
}
```

任务结算后的记录会额外包含：

```json
{
  "missionResult": {
    "successCount": 1,
    "failCount": 1,
    "passed": false
  }
}
```

### VisibleRoleInfo

```json
{
  "myRole": {
    "id": "merlin",
    "name": "梅林",
    "team": "good",
    "description": "知道除莫德雷德外的坏人，终局需要避免被刺客识破。"
  },
  "knownPlayers": [
    {
      "playerId": "p_004",
      "name": "小赵",
      "hint": "evil"
    }
  ],
  "notes": ["你知道除莫德雷德外的坏人。"]
}
```

## 房间接口

### 获取房间列表

`GET /api/rooms`

响应：

```json
{
  "rooms": [
    {
      "id": "room_001",
      "code": "A1B2C3",
      "status": "lobby",
      "playerCount": 5,
      "roleConfig": [
        { "roleId": "merlin", "count": 1 },
        { "roleId": "loyal", "count": 2 },
        { "roleId": "assassin", "count": 1 },
        { "roleId": "minion", "count": 1 }
      ],
      "players": [],
      "createdAt": "2026-04-29T22:00:00.000Z"
    }
  ]
}
```

说明：

- 当前返回所有未关闭房间，包含 `lobby`、`playing`、`finished`。
- 前端如果只展示可加入房间，应过滤 `status === "lobby"` 且 `players.length < playerCount`。
- 当前是内存列表，服务重启后列表会清空。
- 房间被房主解散或因空房间超时自动关闭后，不会再出现在列表里。

### 创建房间

`POST /api/rooms`

请求：

```json
{
  "playerCount": 5,
  "hostName": "小王",
  "roleConfig": [
    { "roleId": "merlin", "count": 1 },
    { "roleId": "loyal", "count": 2 },
    { "roleId": "assassin", "count": 1 },
    { "roleId": "minion", "count": 1 }
  ]
}
```

响应：

```json
{
  "room": {},
  "currentPlayerId": "p_001"
}
```

校验：

- `playerCount` 必须为 5-10。
- `roleConfig` 的 `count` 总和必须等于 `playerCount`。
- `roleId` 必须是当前支持角色。
- 房主自动准备，`isReady: true`。

### 加入房间

`POST /api/rooms/{roomCode}/join`

请求：

```json
{
  "playerName": "小李"
}
```

响应：

```json
{
  "room": {},
  "currentPlayerId": "p_002"
}
```

校验：

- 房间必须存在。
- 房间状态必须是 `lobby`。
- 房间不能已满。

### 更新角色配置

`PUT /api/rooms/{roomCode}/role-config`

请求：

```json
{
  "hostPlayerId": "p_001",
  "playerCount": 5,
  "roleConfig": [
    { "roleId": "merlin", "count": 1 },
    { "roleId": "loyal", "count": 2 },
    { "roleId": "assassin", "count": 1 },
    { "roleId": "minion", "count": 1 }
  ]
}
```

响应：

```json
{
  "room": {}
}
```

校验：

- 只有房主可以操作。
- 房间必须处于 `lobby`。
- 新 `playerCount` 不能小于当前已加入人数。
- `roleConfig` 总数必须等于 `playerCount`。

### 玩家准备

`POST /api/rooms/{roomCode}/ready`

请求：

```json
{
  "playerId": "p_002",
  "isReady": true
}
```

响应：

```json
{
  "room": {}
}
```

说明：

- 房主始终保持 `isReady: true`。

### 获取房间

`GET /api/rooms/{roomCode}`

响应：

```json
{
  "room": {}
}
```

### 获取完整状态

`GET /api/rooms/{roomCode}/state`

请求头：

```http
X-Player-Id: p_002
```

响应：

```json
{
  "room": {},
  "game": {},
  "visibleRoleInfo": {},
  "version": 12
}
```

说明：

- 如果不传 `X-Player-Id`，`visibleRoleInfo` 返回 `null`。
- 如果游戏尚未发身份，`visibleRoleInfo` 返回 `null`。
- 不返回完整身份分配。

### 离开房间

`POST /api/rooms/{roomCode}/leave`

请求：

```json
{
  "playerId": "p_002"
}
```

响应：

```json
{
  "room": {}
}
```

说明：

- 如果房主离开，当前实现会把玩家列表中的第一位玩家设为新房主。

### 解散房间

`POST /api/rooms/{roomCode}/close`

请求：

```json
{
  "hostPlayerId": "p_001"
}
```

响应：

```json
{
  "room": {
    "status": "closed",
    "players": []
  }
}
```

校验：

- 只有房主可以操作。

成功后：

- 房间状态变为 `closed`。
- 房间玩家列表清空。
- `GET /api/rooms` 不再返回该房间。
- 服务端向该房间所有 WebSocket 连接推送 `room.closed`。
- 前端收到 `room.closed` 后应清除本地房间状态，并回到大厅或房间列表。

## 对局接口

### 开始对局

`POST /api/rooms/{roomCode}/game/start`

请求：

```json
{
  "hostPlayerId": "p_001"
}
```

响应：

```json
{
  "game": {},
  "visibleRoleInfo": {}
}
```

校验：

- 只有房主可以操作。
- 房间状态必须是 `lobby`。
- 当前玩家人数必须等于 `playerCount`。
- 所有非房主玩家必须已准备。
- `roleConfig` 总数必须等于 `playerCount`。

开始后：

- 服务端随机分配身份。
- 房间状态变为 `playing`。
- 游戏阶段变为 `role_reveal`。
- 第一位玩家成为首轮队长。
- 通过 WebSocket 给每个玩家单独推送 `game.private_role`。

### 获取游戏状态

`GET /api/rooms/{roomCode}/game`

请求头：

```http
X-Player-Id: p_002
```

响应：

```json
{
  "game": {},
  "visibleRoleInfo": {}
}
```

说明：

- 不传 `X-Player-Id` 时，`visibleRoleInfo` 为 `null`。

### 获取当前玩家身份

`GET /api/rooms/{roomCode}/game/my-role`

请求头：

```http
X-Player-Id: p_002
```

响应：

```json
{
  "visibleRoleInfo": {}
}
```

### 进入发言阶段

`POST /api/rooms/{roomCode}/game/speech`

请求：

```json
{
  "playerId": "p_001"
}
```

响应：

```json
{
  "game": {}
}
```

校验：

- 房主或当前队长可以操作。
- 当前阶段必须是 `role_reveal`、`round_result` 或 `team_building`。

### 提交出任务队伍

`POST /api/rooms/{roomCode}/game/team`

请求：

```json
{
  "leaderPlayerId": "p_001",
  "teamPlayerIds": ["p_001", "p_003"]
}
```

响应：

```json
{
  "game": {}
}
```

校验：

- 只有当前队长可以操作。
- 当前阶段必须是 `speech` 或 `team_building`。
- 队伍人数必须符合人数和轮次规则。
- 队伍中不能有重复玩家。

当前任务人数规则：

| 人数 | 第 1 轮 | 第 2 轮 | 第 3 轮 | 第 4 轮 | 第 5 轮 |
| --- | --- | --- | --- | --- | --- |
| 5 | 2 | 3 | 2 | 3 | 3 |
| 6 | 2 | 3 | 4 | 3 | 4 |
| 7 | 2 | 3 | 3 | 4 | 4 |
| 8 | 3 | 4 | 4 | 5 | 5 |
| 9 | 3 | 4 | 4 | 5 | 5 |
| 10 | 3 | 4 | 4 | 5 | 5 |

提交成功后：

- 阶段变为 `team_vote`。
- 初始化全员队伍投票进度。

### 队伍投票

`POST /api/rooms/{roomCode}/game/team-votes`

请求：

```json
{
  "playerId": "p_002",
  "vote": "approve"
}
```

响应：

```json
{
  "game": {}
}
```

校验：

- 当前阶段必须是 `team_vote`。
- `vote` 必须是 `approve` 或 `reject`。
- 每个玩家每轮只能提交一次。

结算：

- 全员提交后自动结算。
- 同意票数大于反对票数时，进入 `mission_vote`。
- 否则进入 `team_building`，队长轮换到下一位，`teamVoteAttempt` 加 1。
- 队伍投票被否决不算任务失败，但会写入 `game.history`，该条记录 `status` 为 `team_rejected`，且没有 `missionResult`。
- 队伍投票结算后会公开每个玩家的 `approve` / `reject`，字段为 `teamVoteResult.votes`。
- 同一任务轮第 5 次组队时，队长提交队伍后直接进入 `mission_vote`，不再进行队伍投票；该条记录的 `teamVoteResult.forced` 为 `true`。
- 投票未全部提交前只公开进度，不公开每个玩家的具体选择。

### 任务投票

`POST /api/rooms/{roomCode}/game/mission-votes`

请求：

```json
{
  "playerId": "p_003",
  "vote": "success"
}
```

响应：

```json
{
  "game": {}
}
```

校验：

- 当前阶段必须是 `mission_vote`。
- 只有本轮任务队伍内玩家可以投。
- `vote` 必须是 `success` 或 `fail`。
- 好人阵营不能提交 `fail`。
- 每个任务玩家每轮只能提交一次。

结算：

- 全部任务玩家提交后自动结算。
- 7 人及以上第 4 轮需要 2 张失败票才算任务失败；其他情况 1 张失败票即失败。
- 好人完成 3 次任务成功后，如果存在刺客，进入 `assassination`。
- 坏人完成 3 次任务失败后，游戏直接结束，`winner: "evil"`。
- 只公开成功票数、失败票数和任务结果，不公开每个玩家的具体任务票。

### 下一轮

`POST /api/rooms/{roomCode}/game/next-round`

请求：

```json
{
  "playerId": "p_001"
}
```

响应：

```json
{
  "game": {}
}
```

校验：

- 房主或当前队长可以操作。
- 当前阶段必须是 `round_result`。

成功后：

- `round` 加 1。
- 阶段变为 `team_building`。
- 队长轮换到下一位。
- 清空当前任务队伍和投票进度。

### 刺杀梅林

`POST /api/rooms/{roomCode}/game/assassinate`

请求：

```json
{
  "assassinPlayerId": "p_004",
  "targetPlayerId": "p_001"
}
```

响应：

```json
{
  "game": {
    "phase": "finished",
    "winner": "evil"
  }
}
```

校验：

- 当前阶段必须是 `assassination`。
- `assassinPlayerId` 的真实身份必须是 `assassin`。

结算：

- 刺中梅林：坏人胜利。
- 未刺中梅林：好人胜利。

### 重开对局

`POST /api/rooms/{roomCode}/game/reset`

请求：

```json
{
  "hostPlayerId": "p_001"
}
```

响应：

```json
{
  "room": {}
}
```

校验：

- 只有房主可以操作。

成功后：

- 房间状态回到 `lobby`。
- 游戏状态回到 `not_started`。
- 清空身份分配和投票明细。
- 非房主玩家准备状态重置为 `false`。

## WebSocket

### 建立连接

```text
ws://localhost:3000/ws/rooms/{roomCode}?playerId={playerId}
```

连接成功后服务端发送：

```json
{
  "type": "connection.ready",
  "payload": {
    "roomCode": "A1B2C3",
    "playerId": "p_001",
    "serverTime": "2026-04-29T22:00:00.000Z"
  },
  "createdAt": "2026-04-29T22:00:00.000Z"
}
```

建议客户端收到后调用：

```http
GET /api/rooms/{roomCode}/state
X-Player-Id: {playerId}
```

### 服务端事件格式

```json
{
  "type": "game.updated",
  "payload": {},
  "version": 12,
  "createdAt": "2026-04-29T22:05:00.000Z"
}
```

### 服务端事件

#### room.updated

玩家加入、离开、准备状态、角色配置、房间状态变化时广播。

```json
{
  "type": "room.updated",
  "payload": {
    "room": {}
  },
  "version": 3,
  "createdAt": "2026-04-29T22:01:00.000Z"
}
```

#### room.closed

房主解散房间时推送给该房间所有连接。前端收到后应认为当前玩家已经不在房间内。

```json
{
  "type": "room.closed",
  "payload": {
    "roomCode": "A1B2C3",
    "reason": "host_closed"
  },
  "version": 12,
  "createdAt": "2026-04-29T22:01:00.000Z"
}
```

说明：

- `reason: "host_closed"` 表示房主主动解散。
- `reason: "empty_timeout"` 表示所有 WebSocket 连接断开后超过保留时间，服务端自动关闭房间。该场景通常没有在线连接可收到推送；大厅通过 `GET /api/rooms` 刷新后会看不到该房间。

#### game.updated

游戏阶段、队长、队伍、投票进度、胜负变化时广播。

```json
{
  "type": "game.updated",
  "payload": {
    "game": {}
  },
  "version": 8,
  "createdAt": "2026-04-29T22:06:00.000Z"
}
```

#### game.private_role

开局发身份后，服务端给每个玩家单独发送。

```json
{
  "type": "game.private_role",
  "payload": {
    "visibleRoleInfo": {}
  },
  "version": 5,
  "createdAt": "2026-04-29T22:03:00.000Z"
}
```

#### vote.progress

队伍投票或任务投票提交后广播，只公开谁已提交。

```json
{
  "type": "vote.progress",
  "payload": {
    "voteType": "team",
    "required": 5,
    "submitted": 2,
    "players": {
      "p_001": "submitted",
      "p_002": "pending"
    }
  },
  "version": 9,
  "createdAt": "2026-04-29T22:07:00.000Z"
}
```

#### round.result

队伍投票或任务投票完成并结算后广播。注意：被否决的队伍投票会写入 `game.history`，但 `status` 是 `team_rejected` 且没有 `missionResult`，不计为任务失败。队伍投票结算后的 `roundResult.teamVoteResult.votes` 会公开每个玩家的 `approve` / `reject`；任务票个人明细不会公开。

```json
{
  "type": "round.result",
  "payload": {
    "roundResult": {}
  },
  "version": 10,
  "createdAt": "2026-04-29T22:08:00.000Z"
}
```

#### error

WebSocket 消息格式无效时发送给当前连接。

```json
{
  "type": "error",
  "payload": {
    "code": "INVALID_MESSAGE",
    "message": "WebSocket 消息格式无效。"
  },
  "createdAt": "2026-04-29T22:09:00.000Z"
}
```

### 客户端心跳

客户端发送：

```json
{
  "type": "ping",
  "payload": {
    "clientTime": "2026-04-29T22:10:00.000Z"
  }
}
```

服务端返回：

```json
{
  "type": "pong",
  "payload": {
    "serverTime": "2026-04-29T22:10:00.000Z"
  },
  "createdAt": "2026-04-29T22:10:00.000Z"
}
```

## 当前 MVP 限制

- 尚未接数据库或 Redis，服务重启后状态丢失。
- WebSocket 连接和断开当前不会自动更新每个玩家的 `connected` 字段。
- 业务命令当前只走 HTTP，WebSocket 只做服务端推送和心跳。
- 未做登录态鉴权，当前依赖 body 中的 `playerId` 或请求头 `X-Player-Id`。
- 未实现 5 次组队失败自动判坏人胜利。
- 未实现按创建时间或结束时间的房间过期清理；当前只支持空 WebSocket 房间自动关闭。
