export const rebalanceRoles = (): void => {
  const seenRooms = new Set<string>();

  for (const spawnName in Game.spawns) {
    const spawn = Game.spawns[spawnName];
    const room = spawn.room;
    if (seenRooms.has(room.name)) continue;
    seenRooms.add(room.name);

    // --- Harvester wipeout guard ---
    // If no income-generating creep exists in the room but other creeps do,
    // convert the least-critical one to harvester so the room can recover.
    const harvestRoles = new Set(["harvester", "miner", "stationaryHarvester"]);
    const wipeoutOrder: CreepMemory["role"][] = ["builder", "upgrader", "hauler"];
    let hasHarvester = false;
    let wipeoutCandidate: Creep | null = null;

    for (const creepName in Game.creeps) {
      const creep = Game.creeps[creepName];
      if (creep.memory.room !== room.name) continue;
      if (harvestRoles.has(creep.memory.role)) {
        hasHarvester = true;
        break;
      }
    }

    if (!hasHarvester) {
      outerWipeout:
      for (const wipeRole of wipeoutOrder) {
        for (const creepName in Game.creeps) {
          const creep = Game.creeps[creepName];
          if (creep.memory.room !== room.name) continue;
          if (creep.memory.role !== wipeRole) continue;
          wipeoutCandidate = creep;
          break outerWipeout;
        }
      }

      if (wipeoutCandidate != null) {
        wipeoutCandidate.memory.role = "harvester";
        wipeoutCandidate.memory.task = undefined;
        wipeoutCandidate.memory.sourceId = undefined;
      }
    }

    // --- Identify sources ---
    const sources: Source[] = room.find(FIND_SOURCES);

    const containerSourceIds: string[] = [];
    const bareSourceIds: string[] = [];

    for (const source of sources) {
      const adjacent = source.pos.findInRange(FIND_STRUCTURES, 1);
      if (adjacent.some((s: Structure) => s.structureType === STRUCTURE_CONTAINER)) {
        containerSourceIds.push(source.id);
      } else {
        bareSourceIds.push(source.id);
      }
    }

    // --- Find live stationary harvesters per source ---
    const liveStatMap = new Map<string, true>();
    for (const creepName in Game.creeps) {
      const creep = Game.creeps[creepName];
      if (creep.memory.room !== room.name) continue;
      if (creep.memory.role !== "stationaryHarvester") continue;
      if (creep.spawning !== false) continue;
      if (creep.memory.sourceId == null) continue;
      liveStatMap.set(creep.memory.sourceId, true);
    }

    // --- Miner-needed sources: container sources without a live stationaryHarvester ---
    const minerNeededSources: string[] = containerSourceIds.filter(id => !liveStatMap.has(id));

    // --- Step 1: Displace miners whose source now has a live stationaryHarvester ---
    for (const creepName in Game.creeps) {
      const creep = Game.creeps[creepName];
      if (creep.memory.room !== room.name) continue;
      if (creep.memory.role !== "miner") continue;
      if (creep.memory.sourceId != null && liveStatMap.has(creep.memory.sourceId)) {
        creep.memory.task = undefined;
        creep.memory.sourceId = undefined;
        creep.memory.role = "upgrader";
      }
    }

    // --- Recompute role counts after displacement ---
    const roleCounts: Record<string, number> = {};
    for (const creepName in Game.creeps) {
      const creep = Game.creeps[creepName];
      if (creep.memory.room !== room.name) continue;
      if (creep.memory.role === "stationaryHarvester") continue;
      const role = creep.memory.role;
      roleCounts[role] = (roleCounts[role] ?? 0) + 1;
    }

    // --- Targets ---
    const targets: Record<string, number> = {
      harvester: bareSourceIds.length,
      miner: minerNeededSources.length,
      hauler: containerSourceIds.length,
      upgrader: 1,
      builder: 1
    };

    // --- Step 2: General rebalance ---
    const priorityOrder: CreepMemory["role"][] = ["harvester", "miner", "hauler", "upgrader", "builder"];
    const surplusOrder: CreepMemory["role"][] = ["builder", "upgrader", "hauler", "miner", "harvester"];

    // Track which miner-needed sources have been assigned in this batch
    const assignedMinerSources = new Set<string>();

    for (const targetRole of priorityOrder) {
      const current = roleCounts[targetRole] ?? 0;
      const target = targets[targetRole] ?? 0;
      if (current >= target) continue;

      // Find a surplus candidate
      let candidate: Creep | null = null;
      let candidateOldRole: CreepMemory["role"] | null = null;

      outerSearch:
      for (const surplusRole of surplusOrder) {
        if (surplusRole === targetRole) continue;
        const surplusCount = roleCounts[surplusRole] ?? 0;
        const surplusTarget = targets[surplusRole] ?? 0;
        if (surplusCount <= surplusTarget) continue;

        for (const creepName in Game.creeps) {
          const creep = Game.creeps[creepName];
          if (creep.memory.room !== room.name) continue;
          if (creep.memory.role === "stationaryHarvester") continue;
          if (creep.memory.role !== surplusRole) continue;
          candidate = creep;
          candidateOldRole = surplusRole;
          break outerSearch;
        }
      }

      if (candidate == null || candidateOldRole == null) break;

      // Reassign
      const oldRole = candidateOldRole;
      candidate.memory.role = targetRole;
      candidate.memory.task = undefined;
      if (oldRole === "miner" || oldRole === "harvester") {
        candidate.memory.sourceId = undefined;
      }
      if (targetRole === "miner") {
        // Pick first miner-needed source not already assigned in this batch
        const pickedSource = minerNeededSources.find(id => !assignedMinerSources.has(id));
        if (pickedSource != null) {
          candidate.memory.sourceId = pickedSource as Id<Source>;
          assignedMinerSources.add(pickedSource);
        }
      }

      // Update counts
      roleCounts[oldRole] = (roleCounts[oldRole] ?? 1) - 1;
      roleCounts[targetRole] = (roleCounts[targetRole] ?? 0) + 1;
    }
  }
};
