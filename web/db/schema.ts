import { sqliteTable, text, integer, index, primaryKey, uniqueIndex } from 'drizzle-orm/sqlite-core';
export const rooms = sqliteTable('rooms', {
  code: text('code').primaryKey(),
  created: integer('created').notNull(), expires: integer('expires').notNull(),
  hostHash: text('host_hash').notNull(), guestHash: text('guest_hash'),
  status: text('status').notNull().default('waiting'),
  offer: text('offer'), answer: text('answer'),
  hostDeck: text('host_deck').notNull(), guestDeck: text('guest_deck'),
  hostReady: integer('host_ready').notNull().default(0),
  guestReady: integer('guest_ready').notNull().default(0),
  snapshot: text('snapshot'), snapshotSeq: integer('snapshot_seq').notNull().default(0),
  hostSeen: integer('host_seen').notNull(), guestSeen: integer('guest_seen'),
}, table => [index('rooms_expiry').on(table.expires)]);
export const inputs = sqliteTable('inputs', {
  id: text('id').primaryKey(), code: text('code').notNull(),
  seq: integer('seq').notNull(), payload: text('payload').notNull(),
  created: integer('created').notNull(),
}, table => [index('inputs_room_seq').on(table.code, table.seq)]);
export const teamRooms = sqliteTable('team_rooms', {
  code:text('code').primaryKey(), mode:text('mode').notNull(), status:text('status').notNull().default('waiting'),
  created:integer('created').notNull(), expires:integer('expires').notNull(), snapshot:text('snapshot'), snapshotSeq:integer('snapshot_seq').notNull().default(0),
}, table => [index('team_rooms_expiry').on(table.expires)]);
export const roomPlayers = sqliteTable('room_players', {
  code:text('code').notNull(),slot:integer('slot').notNull(),team:integer('team').notNull(),name:text('name').notNull(),tokenHash:text('token_hash').notNull(),
  deck:text('deck').notNull(),ready:integer('ready').notNull().default(0),seen:integer('seen').notNull(),offer:text('offer'),answer:text('answer'),profileHash:text('profile_hash'),
},table=>[primaryKey({columns:[table.code,table.slot]}),uniqueIndex('room_player_tokens').on(table.tokenHash)]);
export const teamInputs = sqliteTable('team_inputs', {
  code:text('code').notNull(),playerId:integer('player_id').notNull(),seq:integer('seq').notNull(),payload:text('payload').notNull(),created:integer('created').notNull(),
},table=>[primaryKey({columns:[table.code,table.playerId,table.seq]})]);
export const playerProfiles=sqliteTable('player_profiles',{
 tokenHash:text('token_hash').primaryKey(),battles:integer('battles').notNull().default(0),unlocked:text('unlocked').notNull().default('[]'),created:integer('created').notNull(),
 deck:text('deck'),settings:text('settings'),revision:integer('revision').notNull().default(0),
});
export const profileBattles=sqliteTable('profile_battles',{
 profileHash:text('profile_hash').notNull(),code:text('code').notNull(),
},table=>[primaryKey({columns:[table.profileHash,table.code]})]);

export const emailAccounts=sqliteTable('email_accounts',{
 id:text('id').primaryKey(),email:text('email').notNull(),name:text('name').notNull(),profileHash:text('profile_hash').notNull(),created:integer('created').notNull(),
},table=>[uniqueIndex('account_email').on(table.email)]);
export const accountSessions=sqliteTable('account_sessions',{
 tokenHash:text('token_hash').primaryKey(),accountId:text('account_id').notNull(),expires:integer('expires').notNull(),
},table=>[index('account_sessions_expiry').on(table.expires)]);
export const emailLoginCodes=sqliteTable('email_login_codes',{
 challengeHash:text('challenge_hash').primaryKey(),email:text('email').notNull(),guestHash:text('guest_hash').notNull(),sourceHash:text('source_hash').notNull(),codeHash:text('code_hash').notNull(),attempts:integer('attempts').notNull().default(0),status:text('status').notNull().default('sending'),created:integer('created').notNull(),expires:integer('expires').notNull(),
},table=>[index('login_codes_email_created').on(table.email,table.created),index('login_codes_guest_created').on(table.guestHash,table.created),index('login_codes_source_created').on(table.sourceHash,table.created),index('login_codes_expiry').on(table.expires)]);
