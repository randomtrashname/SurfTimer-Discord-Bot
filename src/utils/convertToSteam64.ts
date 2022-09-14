﻿import axios from 'axios';
const SteamID = require('steamid');

import { prisma } from '../main';

/**
 * Parse an input and tries to convert it to a steamid64.
 * This function accepts:
 * - vanity steam URL.
 * - regular steam profiles.
 * - any valid steamID.
 * @param  {string} input
 * @param  {string} steamAPIKey
 * @returns Promise
 */
export async function convertToSteam64(
  input: string,
  steamAPIKey: string,
): Promise<string> {
  let match = input.match(/https?:\/\/steamcommunity\.com\/id\/([^\/]+)\/?$/);

  if (match) {
    try {
      const res = await axios.get(
        `http://api.steampowered.com/ISteamUser/ResolveVanityURL/v0001/?key=${steamAPIKey}&vanityurl=${match[1]}`,
      );
      return res.data['response']['steamid'];
    } catch (e) {
      return undefined;
    }
  }
  match = input.match(/https?:\/\/steamcommunity\.com\/profiles\/(\d+)\/?$/);
  if (match) {
    return match[1];
  }
  try {
    let sid = new SteamID(input);
    return sid.getSteamID64();
  } catch (e) { }

  // Try to extrapolate steamid64 by looking in the database.
  const res = await prisma.ck_playerrank.findFirst({
    where: {
      name: {
        contains: input,
      },
    },
    select: {
      steamid64: true,
    },
  });
  if (res !== undefined && res !== null) {
    // console.log(res)
    return res.steamid64;
  }
  return undefined;
}
