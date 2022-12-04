import { Peer as OldPeer, Server, TankPacket, TextPacket, Variant } from "growsockets";
import { PeerDataType } from "../types/peer";
import { WORLD_SIZE } from "../utils/Constants";
import { DataTypes } from "../utils/enums/DataTypes";
import { TankTypes } from "../utils/enums/TankTypes";
import { BaseServer } from "./BaseServer";
import { World } from "./World";

export class Peer extends OldPeer<PeerDataType> {
  public base;

  constructor(server: Server<unknown, unknown, unknown>, netID: number, base: BaseServer) {
    super(server, netID);

    this.base = base;
  }

  /** Extended version of setDataToCache */
  public saveToCache() {
    return this.base.cache.users.set(this.data.netID, this);
  }

  public getSelfCache() {
    return this.base.cache.users.get(this.data.netID);
  }

  public sound(file: string, delay: number = 100) {
    this.send(
      TextPacket.from(DataTypes.ACTION, "action|play_sfx", `file|${file}`, `delayMS|${delay}`)
    );
  }

  public hasWorld(worldName: string) {
    // prettier-ignore
    return this.base.cache.worlds.has(worldName) ? this.base.cache.worlds.get(worldName)! : new World(this.base, worldName);
  }

  public respawn() {
    const world = this.hasWorld(this.data.world!);
    const mainDoor = world.data.blocks?.find((block) => block.fg === 6);

    this.send(
      Variant.from({ netID: this.data.netID }, "OnSetFreezeState", 1),
      Variant.from({ netID: this.data.netID }, "OnKilled"),
      Variant.from({ netID: this.data.netID, delay: 2000 }, "OnSetPos", [
        (mainDoor?.x! % WORLD_SIZE.WIDTH) * 32,
        (mainDoor?.y! % WORLD_SIZE.WIDTH) * 32
      ])
    );

    this.sound("audio/teleport.wav", 2000);
    // put this above later instead send new packet
    this.send(Variant.from({ netID: this.data.netID, delay: 2000 }, "OnSetFreezeState", 0));
  }

  public async enterWorld(worldName: string) {
    const world = this.hasWorld(worldName);
    const mainDoor = world.data.blocks?.find((block) => block.fg === 6);

    await world.enter(this, { x: mainDoor?.x, y: mainDoor?.y });
    this.inventory();
    this.sound("audio/door_open.wav");
  }

  public inventory() {
    let inventory = {
      max: 32,
      items: [
        {
          id: 18, // Fist
          amount: 1
        },
        {
          id: 32, // Wrench
          amount: 1
        },
        {
          id: 2, // Dirt
          amount: 200
        },
        {
          id: 1000, // Public Lava
          amount: 200
        },
        {
          id: 156, // Fairy wing
          amount: 1
        }
      ]
    };

    this.send(
      TankPacket.from({
        type: TankTypes.PEER_INVENTORY,
        data: () => {
          const buffer = Buffer.alloc(7 + inventory.items.length * 4);

          buffer.writeUInt8(0x1); // type?
          buffer.writeUInt32LE(inventory.max, 1);
          buffer.writeUInt16LE(inventory.items.length, 5);

          let offset = 7;

          inventory.items.forEach((item) => {
            buffer.writeUInt16LE(item.id, offset);
            buffer.writeUInt16LE(item.amount, offset + 2); // use bitwise OR (1 << 8) if item is equipped. could be wrong

            offset += 4;
          });

          return buffer;
        }
      })
    );
  }
}