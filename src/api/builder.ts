import { BufferResolvable, AttachmentBuilder, TextChannel } from 'discord.js';
import * as express from 'express';
import { readFileSync } from 'fs';
import nodeHtmlToImage from 'node-html-to-image';

import { client, steamWebApi } from '../main';
import { MapRecordData } from '../types';

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

  let key = `${data.style}${data.bonusGroup}`;
  console.log("Recieved record %s", key);
  let type: recordType = data.style != 0 ? recordType.STYLE : data.bonusGroup > -1 ? recordType.BONUS : recordType.NORMAL;
  console.log("LOG_BUFFER_TYPE %s", recordType[type])

  console.log(data.style != 0 ? 'styleTimer' : data.bonusGroup > -1 ? 'bonusTimer' : 'mainTimer');

  // if (recordData.has(key)) {
  //   console.log("LOG_BUFFER_OVERRIDE");
  //   clearTimeout(data.style != 0 ? styleTimer : data.bonusGroup > -1 ? bonusTimer : mainTimer);
  // } else {
  //   findExistingBuffer(type, data.style != 0 ? styleTimer : data.bonusGroup > -1 ? bonusTimer : mainTimer)
  // }

  recordData.set(key, data);

  console.log("LOG_BUFFER_INSERT");
  clearTimeout(timers[type]);
  timers[type] = setTimeout(() => {
    onTimerFinished(type);
  }, parseInt(process.env.BUFFER_TIME) * 1000)

  console.log("HTTP_RETURN_201")
  return res.sendStatus(201);
});


function onTimerFinished(type: recordType) {
  console.log("LOG_RECORD_ANNOUNCE");
  let exp: string = getRegexFromType(type);

  recordData.forEach(async (value, key, _) => {

    if (!RegExp(exp).test(key)) {
      return;
    }

    console.log("Announcing record %s", key);

    let data = value;
    const playerInfo = await steamWebApi.usersApi.getPlayerSummaries([
      data.steamID64,
    ]);

    if (playerInfo.response.players.length === 0) {
      console.log('ERROR_EMPTY_PLAYER_INFO')
      return;
    }

    const player = playerInfo.response.players[0];

    const channel = client.channels.cache.get(
      process.env.MAP_RECORD_CHANNEL_ID,
    ) as TextChannel;
    const text = readFileSync(
      './templates/map-record-default.html',
      'utf8',
    ).toString();

    // Adding spaces here isn't the best solution, but works for the amount of effort it deserves to get.
    const styles = ["", "Sideways ", "Half-Sideways ", "Backwards ", "Low-Gravity ", "Slow Motion ", "Fast Forward ", "Freestyle "];

    // TODO: Specify which bonus has a new record. (e.g. Surf_Lost2 [Bonus 2])
    nodeHtmlToImage({
      html: text,
      content: {
        playerName: player.personaname,
        style: styles[data.style],
        mapType: data.bonusGroup == -1 ? "map" : "bonus",
        mapName: `${data.mapName}`,
        bonusGroup: `${data.bonusGroup > -1 ? " [BONUS " + data.bonusGroup + "]" : ''}`,
        avatar: player.avatarfull,
        newTime: data.newTime,
        timeDiff: data.timeDiff,
      },
    }).then((image) => {

      const attachment = new AttachmentBuilder(
        image as BufferResolvable);

      const content = {
        files: [attachment],
      };
      channel.send(content);
    });

    recordData.delete(key);
  })
}

api.post('/flush', (req, res) => {

  console.log('LOG_FLUSH_REQUEST');

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
  }

  // Clear the map
  recordData.clear();

  // Send response depending on stuff
  console.log("HTTP_RETURN_201");
  return res.sendStatus(200);
})

// function findExistingBuffer(type: recordType, timer: NodeJS.Timeout) {
//   let exp: string = getRegexFromType(type);

//   if (type != recordType.NORMAL) {
//     let keys = Array.from(recordData.keys());
//     for (var i = 0; i < keys.length; i++) {
//       if (RegExp(exp).test(keys[i])) {
//         console.log("LOG_BUFFER_CLEAR_DUPLICATE_TIMER");
//         clearTimeout(timer);
//         break;
//       }
//     }
//   }
// }

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