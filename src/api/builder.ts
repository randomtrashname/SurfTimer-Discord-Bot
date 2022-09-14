import { PlayerSummary } from '@j4ckofalltrades/steam-webapi-ts/types';
import { BufferResolvable, AttachmentBuilder, TextChannel } from 'discord.js';
import * as express from 'express';
import { readFileSync } from 'fs';

import nodeHtmlToImage from 'node-html-to-image';

import { client, prisma, steamWebApi } from '../main';
import { MapRecordData } from '../types';
import * as moment from 'moment';
export const api = express();

let recordData = new Map<string, MapRecordData>;
let timers: NodeJS.Timeout[] = [];

enum recordType {
  NORMAL = 0,
  BONUS = 1,
  STYLE = 2,
  ALL = 3
}

api.use(express.json());

api.post('/record', async (req, res) => {
  const data = req.body as MapRecordData;
  if (data.apiKey !== process.env.API_KEY) {
    console.log('ERROR_NO_API_KEY')
    return res.sendStatus(403);
  }

  // console.log('LOG_PRISMA_CREATE_RECORD');
  await prisma.$executeRaw`
    INSERT INTO st_records(steamid64, map, runtime, style, bonusGroup) 
    VALUES (${data.steamID64},${data.mapName},${moment(data.newTime, 'mm:ss:SS').diff(moment().startOf('day'), 'milliseconds') / 1000},${data.style},${data.bonusGroup})`;

  let key = `${data.style}${data.bonusGroup}`;
  // console.log("Recieved record %s from %s", key, data.steamID64);
  let type: recordType = data.style != 0 ? recordType.STYLE : data.bonusGroup > -1 ? recordType.BONUS : recordType.NORMAL;
  // console.log("LOG_BUFFER_TYPE %s", recordType[type])
  recordData.set(key, data);

  // console.log("LOG_BUFFER_INSERT");
  clearTimeout(timers[type]);
  timers[type] = setTimeout(() => {
    onTimerFinished(type);
  }, parseInt(process.env.BUFFER_TIME) * 1000)

  // console.log("HTTP_RETURN_201")
  return res.sendStatus(201);
});


async function onTimerFinished(type: recordType) {
  // console.log("LOG_RECORD_ANNOUNCE");

  const channel = client.channels.cache.get(
    process.env.MAP_RECORD_CHANNEL_ID,
  ) as TextChannel;

  const exp: string = getRegexFromType(type);
  const a = Array.from(recordData.keys()).filter((x) => RegExp(exp).test(x));

  var content = await generateImages(a);

  if (content.files.length != 0) {
    channel.send(content);
  }
}

api.post('/flush', (req, res) => {
  // console.log('LOG_FLUSH_REQUEST');

  // Might as well reuse existing interfaces
  const data = req.body as MapRecordData;
  if (data.apiKey !== process.env.API_KEY) {
    console.log('ERROR_NO_API_KEY')
    return res.sendStatus(403);
  }
  // Stop all the timers
  clearTimeout(timers[0]);
  clearTimeout(timers[1]);
  clearTimeout(timers[2]);

  if (recordData.size != 0) {
    // Send out all the new records
    onTimerFinished(recordType.ALL);

    // Clear the map
    recordData.clear();
  }

  // Send response depending on stuff
  // console.log("HTTP_RETURN_201");
  return res.sendStatus(200);
})


function getRegexFromType(type: recordType) {
  let exp: string = "";
  switch (type) {
    case recordType.NORMAL:
      exp = "^(0-1)";
      break;
    case recordType.BONUS:
      exp = "0[{0-9}]"
      break;
    case recordType.STYLE:
      exp = "^[^0][-]?[0-9]"
      break;
    case recordType.ALL:
      exp = ".{2,}";
      break;
  }

  return exp;
}

async function generateImages(a: string[]) {
  const content = {
    files: [],
  };

  for (var i = 0; i < a.length; i++) {
    const data = recordData.get(a[i]);

    if (data == undefined) {
      console.log("ERROR_EMPTY_DATA - KEY: %s", a[i])
      continue;
    }

    // console.log("GENERATE_IMAGES_FETCH_PREVIOUS_RECORD");
    const oldPlayerInfo = await getPreviousRecordData(data);
    const oldPlayer = oldPlayerInfo.player;
    const oldTime = oldPlayerInfo.time;

    const newPlayerInfo = await steamWebApi.usersApi.getPlayerSummaries([
      data.steamID64,
    ]);

    if (newPlayerInfo.response.players.length === 0) {
      console.log('ERROR_EMPTY_PLAYER_INFO')
      return content;
    }

    const newPlayer = newPlayerInfo.response.players[0];

    const text = oldPlayer == undefined ? readFileSync(
      './templates/map-record-default.html',
      'utf8',
    ).toString() : readFileSync(
      './templates/map-record-replace.html',
      'utf8',
    ).toString();

    await nodeHtmlToImage({
      html: text,
      content: await generateHtmlContent(newPlayer, data, oldPlayer, oldTime),
    }).then((image) => {
      const attachment = new AttachmentBuilder(
        image as BufferResolvable);

      content.files = [attachment, ...content.files]
    });

    recordData.delete(a[i]);
  }

  return content;
}

async function generateHtmlContent(newPlayer: PlayerSummary, data: MapRecordData, oldPlayer?: PlayerSummary, oldTime?: number) {
  // Adding spaces here isn't the best solution, but works for the amount of effort it deserves to get.
  const styles = ["", "Sideways ", "Half-Sideways ", "Backwards ", "Low-Gravity ", "Slow Motion ", "Fast Forward ", "Freestyle "];
  let x;

  if (oldPlayer == undefined) {
    // console.log("GENERATE_HTML_UNDEFINDED_OLD_PLAYER")
    x = {
      playerName: newPlayer.personaname,
      style: styles[data.style],
      mapType: data.bonusGroup == -1 ? "map" : "bonus",
      mapName: `${data.mapName}`,
      bonusGroup: `${data.bonusGroup > -1 ? " [BONUS " + data.bonusGroup + "]" : ''}`,
      avatar: newPlayer.avatarfull,
      newTime: data.newTime,
      timeDiff: data.timeDiff,
    };
  } else {
    let t = moment().startOf('day').add(oldTime, 'seconds').format('mm:ss:SS').toString();
    // console.log("GENERATE_HTML_FOUND_OLD_PLAYER - %s - %d", oldPlayer.personaname, oldTime);
    x = {
      oldPlayerName: oldPlayer.personaname,
      newPlayerName: newPlayer.personaname,
      style: styles[data.style],
      mapType: data.bonusGroup == -1 ? "map" : "bonus",
      mapName: `${data.mapName}`,
      bonusGroup: `${data.bonusGroup > -1 ? " [BONUS " + data.bonusGroup + "]" : ''}`,
      oldAvatar: oldPlayer.avatarfull,
      newAvatar: newPlayer.avatarfull,
      oldTime: t,
      newTime: data.newTime,
      timeDiff: data.timeDiff,
    };
  }

  return x;
}

async function getPreviousRecordData(data: MapRecordData) {
  let p: PlayerSummary, t: number;

  // Search st_records for any previous record on given map.
  const record = await prisma.st_records.findFirst({
    orderBy: {
      date: 'desc'
    },
    where: {
      map: data.mapName,
      style: data.style,
      bonusGroup: data.bonusGroup
    },
    skip: 1,
    take: 1,
    select: {
      bonusGroup: true,
      map: true,
      runtime: true,
      steamid64: true,
      style: true
    }
  })

  if (record != undefined) {
    const playerInfo = await steamWebApi.usersApi.getPlayerSummaries([
      record.steamid64,
    ]);

    p = playerInfo.response.players[0];
    t = record.runtime;
    // console.log("GET_PREVIOUS_RECORD_DATA_PLAYER - %s", p.personaname);
  }
  else if (data.style == 0 && data.bonusGroup == -1) {
    // Search ck_latestrecords for any previous record on given map.
    const ck_record = await prisma.ck_latestrecords.findFirst({
      orderBy: {
        date: 'desc'
      },
      where:
      {
        map: data.mapName
      },
      skip: 1,
      take: 1,
      select: {
        steamid: true,
        runtime: true
      }
    })

    if (ck_record?.steamid != undefined) {
      // console.log("GET_PREVIOUS_RECORD_DATA_TIME - %d", ck_record.runtime)
      const player = await prisma.ck_playerrank.findFirst({
        where: {
          steamid: ck_record.steamid
        },
        select: {
          steamid64: true
        }
      })

      const playerInfo = await steamWebApi.usersApi.getPlayerSummaries([
        player.steamid64,
      ]);

      p = playerInfo.response.players[0];
      t = ck_record.runtime;
      // console.log("GET_PREVIOUS_RECORD_DATA_PLAYER - %s", p.personaname);
    }
  }

  return {
    player: p,
    time: t,
  };
}
