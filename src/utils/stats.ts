/**
 * Stats utility — writes a per-room creep summary to Memory.stats every tick.
 *
 * Inspect in-game via the Memory viewer or the console:
 *   Memory.stats.rooms["W1N1"]
 *   => { totalCreeps: 8, byRole: { harvester: 3, upgrader: 2, ... } }
 */
export const updateStats = (): void => {
  const rooms: { [roomName: string]: RoomStats } = {};

  for (const name in Game.creeps) {
    const creep = Game.creeps[name];
    const room = creep.memory.room;
    if (room == null) continue;

    if (rooms[room] == null) {
      rooms[room] = { totalCreeps: 0, byRole: {} };
    }

    rooms[room].totalCreeps++;
    const role = creep.memory.role;
    rooms[room].byRole[role] = (rooms[room].byRole[role] ?? 0) + 1;
  }

  Memory.stats = { rooms };
};
