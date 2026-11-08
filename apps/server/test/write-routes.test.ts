/**
 * P3.7 / L5 / L6: every non-GET endpoint, checked against the required guard order:
 * auth guard → strict schema → rate limit → location → ownership.
 *
 * The table below must list every POST/PUT/PATCH/DELETE route in src/app/api. The first
 * test scans the folder and fails if a new write route was added without an entry here.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import * as authLogin from '@/app/api/v1/auth/login/route';
import * as authLogout from '@/app/api/v1/auth/logout/route';
import * as resetCode from '@/app/api/v1/auth/password-reset/confirm-code/route';
import * as resetConfirm from '@/app/api/v1/auth/password-reset/confirm/route';
import * as resetRequest from '@/app/api/v1/auth/password-reset/request/route';
import * as authRegister from '@/app/api/v1/auth/register/route';
import * as authSessions from '@/app/api/v1/auth/sessions/route';
import * as verifyCode from '@/app/api/v1/auth/verify-email/code/route';
import * as verifyResend from '@/app/api/v1/auth/verify-email/resend/route';
import * as verifyLink from '@/app/api/v1/auth/verify-email/route';
import * as bizComments from '@/app/api/v1/business-posts/[id]/comments/route';
import * as bizPost from '@/app/api/v1/business-posts/[id]/route';
import * as bizVote from '@/app/api/v1/business-posts/[id]/vote/route';
import * as comment from '@/app/api/v1/comments/[id]/route';
import * as commentVote from '@/app/api/v1/comments/[id]/vote/route';
import * as feed from '@/app/api/v1/feed/route';
import * as ads from '@/app/api/v1/ads/route';
import * as adViews from '@/app/api/v1/ads/views/route';
import * as adInterest from '@/app/api/v1/ads/[id]/interest/route';
import * as guests from '@/app/api/v1/guests/route';
import * as installations from '@/app/api/v1/installations/route';
import * as locationStatus from '@/app/api/v1/location/status/route';
import * as meDelete from '@/app/api/v1/me/delete/route';
import * as meEmailConfirm from '@/app/api/v1/me/email/confirm/route';
import * as meGiveaway from '@/app/api/v1/me/giveaways/[id]/route';
import * as meEmail from '@/app/api/v1/me/email/route';
import * as mePassword from '@/app/api/v1/me/password/route';
import * as prefs from '@/app/api/v1/me/preferences/route';
import * as meUsername from '@/app/api/v1/me/username/route';
import * as userBlock from '@/app/api/v1/users/[username]/block/route';
import * as userProfile from '@/app/api/v1/users/[username]/route';
import * as reports from '@/app/api/v1/reports/route';
import * as photos from '@/app/api/v1/photos/route';
import * as voice from '@/app/api/v1/voice/route';
import * as videos from '@/app/api/v1/videos/route';
import * as guides from '@/app/api/v1/me/guides/route';
import * as ownerClaims from '@/app/api/v1/places/[id]/owner-claims/route';
import * as ownerConfirm from '@/app/api/v1/owner-claims/[id]/confirm/route';
import * as ownerProof from '@/app/api/v1/owner-claims/[id]/proof/route';
import * as ownerCancel from '@/app/api/v1/owner-claims/[id]/cancel/route';
import * as contact from '@/app/api/v1/contact/route';
import * as chatStatus from '@/app/api/v1/chat/status/route';
import * as chatList from '@/app/api/v1/chat/messages/list/route';
import * as chatSend from '@/app/api/v1/chat/messages/route';
import * as messages from '@/app/api/v1/messages/route';
import * as messageUnsend from '@/app/api/v1/messages/[id]/unsend/route';
import * as messageHide from '@/app/api/v1/messages/[id]/hide/route';
import * as chatHide from '@/app/api/v1/messages/conversations/[id]/hide/route';
import * as placeChanges from '@/app/api/v1/places/changes/route';
import * as placeVote from '@/app/api/v1/places/changes/vote/route';
import * as pollVote from '@/app/api/v1/polls/[id]/vote/route';
import * as topicList from '@/app/api/v1/topics/[id]/posts/list/route';
import * as topicSuggest from '@/app/api/v1/topics/suggestions/route';
import * as topicCreate from '@/app/api/v1/topics/route';
import * as topicPage from '@/app/api/v1/topics/list/route';
import * as topicFollow from '@/app/api/v1/topics/[id]/follow/route';
import * as topicOne from '@/app/api/v1/topics/[id]/route';
import * as pollSuggest from '@/app/api/v1/polls/suggestions/route';
import * as placeRemoval from '@/app/api/v1/places/[id]/removal/route';
import * as friendRequests from '@/app/api/v1/friends/requests/route';
import * as friendRequest from '@/app/api/v1/friends/requests/[id]/route';
import * as friendAccept from '@/app/api/v1/friends/requests/[id]/accept/route';
import * as friendDecline from '@/app/api/v1/friends/requests/[id]/decline/route';
import * as friend from '@/app/api/v1/friends/[username]/route';
import * as notificationsRead from '@/app/api/v1/notifications/read/route';
import * as friendPrivacy from '@/app/api/v1/me/friend-privacy/route';
import * as areaStats from '@/app/api/v1/me/area-stats/route';
import * as meAvatar from '@/app/api/v1/me/avatar/route';
import * as meColor from '@/app/api/v1/me/color/route';
import * as submissions from '@/app/api/v1/submissions/route';
import * as submissionCheck from '@/app/api/v1/submissions/check/route';
import * as meAppeals from '@/app/api/v1/me/appeals/route';
import * as restrictedAppeal from '@/app/api/v1/appeals/restricted/route';
import * as restrictedStanding from '@/app/api/v1/appeals/restricted/standing/route';
import * as profile from '@/app/api/v1/me/profile/route';
import * as favorite from '@/app/api/v1/places/[id]/favorite/route';
import * as ownerTeam from '@/app/api/v1/places/[id]/owner-team/route';
import * as ownerTeamMember from '@/app/api/v1/places/[id]/owner-team/[claimId]/route';
import * as placeRating from '@/app/api/v1/places/[id]/rating/route';
import * as roomList from '@/app/api/v1/places/[id]/posts/list/route';
import * as roomPosts from '@/app/api/v1/places/[id]/posts/route';
import * as place from '@/app/api/v1/places/[id]/route';
import * as search from '@/app/api/v1/places/search/route';
import * as postComments from '@/app/api/v1/posts/[id]/comments/route';
import * as postOne from '@/app/api/v1/posts/[id]/route';
import * as postVote from '@/app/api/v1/posts/[id]/vote/route';
import * as posts from '@/app/api/v1/posts/route';
import { createSession } from '@/server/auth/sessions';
import { db } from '@/server/db';
import { importOsmPlaces } from '@/server/directory/osm';
import { readBoundaryFile } from '@/server/location/boundary-file';
import { importServiceArea } from '@/server/location/service-area';
import { relaxBurstLimits, resetDb } from './db-helpers';
import { callRoute, type AnyHandler } from './route-call';
import { createTestUser } from './user-factory';

const IN = { latitude: 30.315, longitude: -81.686, accuracyMeters: 10 };
const OUT = { latitude: 30.1661, longitude: -81.7065, accuracyMeters: 10 }; // Orange Park
const r = (p: typeof IN) => ({ ...p, timestamp: Date.now() - 2_000 });

type Id =
  'place' | 'post' | 'bizPost' | 'comment' | 'username' | 'friendRequest' | 'poll' | 'topic' | null;
interface Row {
  route: string;
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  handler: AnyHandler;
  auth: boolean;
  id: Id;
  /** A valid body (built fresh per call so readings are always recent). */
  body?: (at: typeof IN) => Record<string, unknown>;
  /** True when the route checks the caller's location. */
  location: boolean;
}

const h = (m: Record<string, unknown>, k: string) => m[k] as AnyHandler;
const ROWS: Row[] = [
  // Public (no session)
  {
    route: 'auth/register',
    method: 'POST',
    handler: h(authRegister, 'POST'),
    auth: false,
    id: null,
    location: false,
    body: () => ({
      username: 'someone',
      email: 's@example.test',
      password: 'correct horse battery',
      birthYear: 1990,
      acceptTerms: true,
      confirmAdult: true,
    }),
  },
  {
    route: 'auth/login',
    method: 'POST',
    handler: h(authLogin, 'POST'),
    auth: false,
    id: null,
    location: false,
    body: () => ({ identifier: 'x', password: 'y' }),
  },
  {
    route: 'auth/verify-email',
    method: 'POST',
    handler: h(verifyLink, 'POST'),
    auth: false,
    id: null,
    location: false,
    body: () => ({ token: 'x'.repeat(43) }),
  },
  {
    route: 'auth/password-reset/request',
    method: 'POST',
    handler: h(resetRequest, 'POST'),
    auth: false,
    id: null,
    location: false,
    body: () => ({ email: 'a@example.test' }),
  },
  {
    route: 'auth/password-reset/confirm',
    method: 'POST',
    handler: h(resetConfirm, 'POST'),
    auth: false,
    id: null,
    location: false,
    body: () => ({ token: 'x'.repeat(43), newPassword: 'correct horse battery' }),
  },
  {
    route: 'auth/password-reset/confirm-code',
    method: 'POST',
    handler: h(resetCode, 'POST'),
    auth: false,
    id: null,
    location: false,
    body: () => ({ email: 'a@example.test', code: '123456', newPassword: 'correct horse battery' }),
  },
  {
    route: 'guests',
    method: 'POST',
    handler: h(guests, 'POST'),
    auth: false,
    id: null,
    location: false,
    body: () => ({}),
  },
  {
    route: 'installations',
    method: 'POST',
    handler: h(installations, 'POST'),
    auth: false,
    id: null,
    location: false,
    body: () => ({}),
  },
  // Account
  {
    route: 'auth/logout',
    method: 'POST',
    handler: h(authLogout, 'POST'),
    auth: true,
    id: null,
    location: false,
  },
  {
    route: 'auth/sessions',
    method: 'DELETE',
    handler: h(authSessions, 'DELETE'),
    auth: true,
    id: null,
    location: false,
  },
  {
    route: 'auth/verify-email/resend',
    method: 'POST',
    handler: h(verifyResend, 'POST'),
    auth: true,
    id: null,
    location: false,
    body: () => ({}),
  },
  {
    route: 'auth/verify-email/code',
    method: 'POST',
    handler: h(verifyCode, 'POST'),
    auth: true,
    id: null,
    location: false,
    body: () => ({ code: '123456' }),
  },
  {
    route: 'me/profile',
    method: 'PATCH',
    handler: h(profile, 'PATCH'),
    auth: true,
    id: null,
    location: false,
    body: () => ({ bio: 'hi' }),
  },
  {
    route: 'me/username',
    method: 'PATCH',
    handler: h(meUsername, 'PATCH'),
    auth: true,
    id: null,
    location: false,
    body: () => ({ username: 'new_name' }),
  },
  {
    route: 'me/password',
    method: 'POST',
    handler: h(mePassword, 'POST'),
    auth: true,
    id: null,
    location: false,
    body: () => ({ currentPassword: 'x', newPassword: 'correct horse battery' }),
  },
  {
    route: 'me/email',
    method: 'POST',
    handler: h(meEmail, 'POST'),
    auth: true,
    id: null,
    location: false,
    body: () => ({ newEmail: 'n@example.test', password: 'x' }),
  },
  {
    // D188: accept or decline a prize (any UUID: the guards run before the lookup).
    route: 'me/giveaways/[id]',
    method: 'POST',
    handler: h(meGiveaway, 'POST'),
    auth: true,
    id: 'post',
    location: false,
    body: () => ({ accept: true }),
  },
  {
    route: 'me/email/confirm',
    method: 'POST',
    handler: h(meEmailConfirm, 'POST'),
    auth: true,
    id: null,
    location: false,
    body: () => ({ code: '123456' }),
  },
  {
    route: 'me/appeals',
    method: 'POST',
    handler: h(meAppeals, 'POST'),
    auth: true,
    id: null,
    location: false,
    body: () => ({ actionId: '00000000-0000-7000-8000-000000000000', message: 'please review' }),
  },
  // P5.7: password instead of a session (banned/suspended people can't sign in).
  {
    route: 'appeals/restricted',
    method: 'POST',
    handler: h(restrictedAppeal, 'POST'),
    auth: false,
    id: null,
    location: false,
    body: () => ({
      identifier: 'nobody',
      password: 'x',
      actionId: '00000000-0000-7000-8000-000000000000',
      message: 'please review',
    }),
  },
  {
    route: 'appeals/restricted/standing',
    method: 'POST',
    handler: h(restrictedStanding, 'POST'),
    auth: false,
    id: null,
    location: false,
    body: () => ({ identifier: 'nobody', password: 'x' }),
  },
  {
    route: 'me/delete',
    method: 'POST',
    handler: h(meDelete, 'POST'),
    auth: true,
    id: null,
    location: false,
    body: () => ({ password: 'x', confirm: 'DELETE' }),
  },
  {
    route: 'users/[username]/block',
    method: 'PUT',
    handler: h(userBlock, 'PUT'),
    auth: true,
    id: 'username',
    location: false,
    body: () => ({}),
  },
  {
    route: 'users/[username]/block',
    method: 'DELETE',
    handler: h(userBlock, 'DELETE'),
    auth: true,
    id: 'username',
    location: false,
    body: () => ({}),
  },
  {
    route: 'users/[username]',
    method: 'POST',
    handler: h(userProfile, 'POST'),
    auth: true,
    id: 'username',
    location: true,
    body: (at) => ({ reading: r(at) }),
  },
  // P6.1: the body is the image itself, so no JSON smuggling check here (photos.test.ts).
  {
    route: 'photos',
    method: 'POST',
    handler: h(photos, 'POST'),
    auth: true,
    id: null,
    location: false,
  },
  // D98: private messages (messages.test.ts has membership and friendship checks).
  {
    route: 'messages',
    method: 'POST',
    handler: h(messages, 'POST'),
    auth: true,
    id: null,
    location: true,
    body: (at) => ({ reading: r(at), to: 'other_w', body: 'hi' }),
  },
  {
    route: 'messages/[id]/unsend',
    method: 'POST',
    handler: h(messageUnsend, 'POST'),
    auth: true,
    id: 'post',
    location: false,
    body: () => ({}),
  },
  {
    route: 'messages/[id]/hide',
    method: 'POST',
    handler: h(messageHide, 'POST'),
    auth: true,
    id: 'post',
    location: false,
    body: () => ({}),
  },
  {
    route: 'messages/conversations/[id]/hide',
    method: 'POST',
    handler: h(chatHide, 'POST'),
    auth: true,
    id: 'post',
    location: false,
    body: () => ({}),
  },
  // D218: area chat (chat.test.ts has rooms, limits, mutes and reports).
  {
    route: 'chat/status',
    method: 'POST',
    handler: h(chatStatus, 'POST'),
    auth: true,
    id: null,
    location: true,
    body: (at) => ({ reading: r(at) }),
  },
  {
    route: 'chat/messages/list',
    method: 'POST',
    handler: h(chatList, 'POST'),
    auth: true,
    id: null,
    location: true,
    body: (at) => ({ reading: r(at) }),
  },
  {
    route: 'chat/messages',
    method: 'POST',
    handler: h(chatSend, 'POST'),
    auth: true,
    id: null,
    location: true,
    body: (at) => ({ reading: r(at), body: 'hello' }),
  },
  // D94: community place voting (place-voting.test.ts has the behavior).
  {
    route: 'places/changes',
    method: 'POST',
    handler: h(placeChanges, 'POST'),
    auth: true,
    id: null,
    location: true,
    body: (at) => ({ reading: r(at) }),
  },
  {
    // The change is looked up before the location check, so location is tested there.
    route: 'places/changes/vote',
    method: 'POST',
    handler: h(placeVote, 'POST'),
    auth: true,
    id: null,
    location: false,
    body: (at) => ({
      reading: r(at),
      kind: 'add',
      id: '00000000-0000-7000-8000-000000000000',
      support: true,
    }),
  },
  {
    // Table accounts are brand new (refused before the location check); see place-voting.test.ts.
    route: 'places/[id]/removal',
    method: 'POST',
    handler: h(placeRemoval, 'POST'),
    auth: true,
    id: 'place',
    location: false,
    body: (at) => ({ reading: r(at) }),
  },
  {
    // Table accounts are brand new (refused before the location check); see polls.test.ts.
    route: 'polls/[id]/vote',
    method: 'POST',
    handler: h(pollVote, 'POST'),
    auth: true,
    id: 'poll',
    location: false,
    body: (at) => ({ reading: r(at), choiceIds: ['00000000-0000-7000-8000-000000000000'] }),
  },
  // D125: citywide topics.
  {
    route: 'topics/[id]/posts/list',
    method: 'POST',
    handler: h(topicList, 'POST'),
    auth: true,
    id: 'topic',
    location: true,
    body: (at) => ({ reading: r(at) }),
  },
  // D133: create, list, follow; poll suggestions.
  {
    route: 'topics',
    method: 'POST',
    handler: h(topicCreate, 'POST'),
    auth: true,
    id: null,
    location: true,
    body: (at) => ({ reading: r(at), scope: 'city', title: 'Best sunsets in Jax' }),
  },
  {
    route: 'topics/list',
    method: 'POST',
    handler: h(topicPage, 'POST'),
    auth: true,
    id: null,
    location: true,
    body: (at) => ({ reading: r(at), scope: 'city' }),
  },
  {
    route: 'topics/[id]/follow',
    method: 'PUT',
    handler: h(topicFollow, 'PUT'),
    auth: true,
    id: 'topic',
    location: false,
  },
  {
    route: 'topics/[id]/follow',
    method: 'DELETE',
    handler: h(topicFollow, 'DELETE'),
    auth: true,
    id: 'topic',
    location: false,
  },
  // D134: the creator shows / hides their name, or deletes the topic.
  {
    route: 'topics/[id]',
    method: 'PATCH',
    handler: h(topicOne, 'PATCH'),
    auth: true,
    id: 'topic',
    location: false,
    body: () => ({ showCreator: true }),
  },
  {
    route: 'topics/[id]',
    method: 'DELETE',
    handler: h(topicOne, 'DELETE'),
    auth: true,
    id: 'topic',
    location: false,
  },
  {
    route: 'polls/suggestions',
    method: 'POST',
    handler: h(pollSuggest, 'POST'),
    auth: true,
    id: null,
    location: false,
    body: () => ({ question: 'Should the Riverwalk get more lights?' }),
  },
  {
    route: 'topics/suggestions',
    method: 'POST',
    handler: h(topicSuggest, 'POST'),
    auth: true,
    id: null,
    location: false,
    body: () => ({ title: 'Best tacos in Riverside' }),
  },
  // D90: Contact us (contact.test.ts).
  {
    route: 'contact',
    method: 'POST',
    handler: h(contact, 'POST'),
    auth: true,
    id: null,
    location: false,
    body: () => ({ category: 'GENERAL', subject: 'Hello', body: 'Just saying hello to you.' }),
  },
  // D104: first-time guides (guides.test.ts).
  {
    route: 'me/guides',
    method: 'POST',
    handler: h(guides, 'POST'),
    auth: true,
    id: null,
    location: false,
    body: () => ({ key: 'areaPost' }),
  },
  // D103: business owner claims (owners.test.ts has the behavior).
  {
    route: 'places/[id]/owner-claims',
    method: 'POST',
    handler: h(ownerClaims, 'POST'),
    auth: true,
    id: 'place',
    location: false,
    body: () => ({ method: 'WEBSITE' }),
  },
  // D157: the owner team (the primary owner manages it).
  {
    route: 'places/[id]/owner-team',
    method: 'POST',
    handler: h(ownerTeam, 'POST'),
    auth: true,
    id: 'place',
    location: false,
    body: () => ({ username: 'someone' }),
  },
  {
    route: 'places/[id]/owner-team/[claimId]',
    method: 'PATCH',
    handler: h(ownerTeamMember, 'PATCH'),
    auth: true,
    id: 'place',
    location: false,
    body: () => ({ staffName: 'Sarah' }),
  },
  {
    route: 'places/[id]/owner-team/[claimId]',
    method: 'DELETE',
    handler: h(ownerTeamMember, 'DELETE'),
    auth: true,
    id: 'place',
    location: false,
  },
  {
    route: 'owner-claims/[id]/confirm',
    method: 'POST',
    handler: h(ownerConfirm, 'POST'),
    auth: true,
    id: 'post',
    location: false,
    body: () => ({ code: '123456' }),
  },
  {
    route: 'owner-claims/[id]/proof',
    method: 'POST',
    handler: h(ownerProof, 'POST'),
    auth: true,
    id: 'post',
    location: false,
    body: () => ({ proofUrl: 'https://example.com/code' }),
  },
  {
    route: 'owner-claims/[id]/cancel',
    method: 'POST',
    handler: h(ownerCancel, 'POST'),
    auth: true,
    id: 'post',
    location: false,
    body: () => ({}),
  },
  // D102: the body is the video itself (video.test.ts).
  {
    route: 'videos',
    method: 'POST',
    handler: h(videos, 'POST'),
    auth: true,
    id: null,
    location: false,
  },
  // D76: friends and the bell (friends.test.ts has the behavior).
  {
    route: 'friends/requests',
    method: 'POST',
    handler: h(friendRequests, 'POST'),
    auth: true,
    id: null,
    location: false,
    body: () => ({ username: 'other_w' }),
  },
  {
    route: 'friends/requests/[id]',
    method: 'DELETE',
    handler: h(friendRequest, 'DELETE'),
    auth: true,
    id: 'friendRequest',
    location: false,
  },
  {
    route: 'friends/requests/[id]/accept',
    method: 'POST',
    handler: h(friendAccept, 'POST'),
    auth: true,
    id: 'friendRequest',
    location: false,
    body: () => ({}),
  },
  {
    route: 'friends/requests/[id]/decline',
    method: 'POST',
    handler: h(friendDecline, 'POST'),
    auth: true,
    id: 'friendRequest',
    location: false,
    body: () => ({}),
  },
  {
    route: 'friends/[username]',
    method: 'DELETE',
    handler: h(friend, 'DELETE'),
    auth: true,
    id: 'username',
    location: false,
  },
  {
    route: 'notifications/read',
    method: 'POST',
    handler: h(notificationsRead, 'POST'),
    auth: true,
    id: null,
    location: false,
    body: () => ({}),
  },
  {
    route: 'me/friend-privacy',
    method: 'PATCH',
    handler: h(friendPrivacy, 'PATCH'),
    auth: true,
    id: null,
    location: false,
    body: () => ({ hidePostsFromFriends: true }),
  },
  {
    route: 'me/area-stats',
    method: 'PATCH',
    handler: h(areaStats, 'PATCH'),
    auth: true,
    id: null,
    location: false,
    body: () => ({ optOut: true }),
  },
  // D75: likewise the body is the recording itself (voice.test.ts).
  {
    route: 'voice',
    method: 'POST',
    handler: h(voice, 'POST'),
    auth: true,
    id: null,
    location: false,
  },
  {
    route: 'me/color',
    method: 'PATCH',
    handler: h(meColor, 'PATCH'),
    auth: true,
    id: null,
    location: false,
    body: () => ({ color: 'navy' }),
  },
  {
    route: 'me/avatar',
    method: 'PUT',
    handler: h(meAvatar, 'PUT'),
    auth: true,
    id: null,
    location: false,
    body: () => ({ photoId: '00000000-0000-7000-8000-000000000000' }),
  },
  {
    route: 'me/avatar',
    method: 'DELETE',
    handler: h(meAvatar, 'DELETE'),
    auth: true,
    id: null,
    location: false,
  },
  {
    route: 'submissions',
    method: 'POST',
    handler: h(submissions, 'POST'),
    auth: true,
    id: null,
    location: true,
    body: (at) => ({ reading: r(at), name: 'Corner Cafe', category: 'cafe' }),
  },
  {
    route: 'submissions/check',
    method: 'POST',
    handler: h(submissionCheck, 'POST'),
    auth: true,
    id: null,
    location: true,
    body: (at) => ({ reading: r(at), name: 'Corner Cafe' }),
  },
  {
    route: 'reports',
    method: 'POST',
    handler: h(reports, 'POST'),
    auth: true,
    id: null,
    location: true,
    body: (at) => ({
      reading: r(at),
      target: { type: 'user', username: 'owner_w' },
      reason: 'SPAM',
    }),
  },
  {
    route: 'me/preferences',
    method: 'PATCH',
    handler: h(prefs, 'PATCH'),
    auth: true,
    id: null,
    location: false,
    body: () => ({ radiusMiles: 0.2 }),
  },
  {
    route: 'places/[id]/favorite',
    method: 'PUT',
    handler: h(favorite, 'PUT'),
    auth: true,
    id: 'place',
    location: false,
    body: () => ({}),
  },
  {
    route: 'places/[id]/favorite',
    method: 'DELETE',
    handler: h(favorite, 'DELETE'),
    auth: true,
    id: 'place',
    location: false,
    body: () => ({}),
  },
  // Location-bound reads (POST because they carry a reading)
  {
    route: 'location/status',
    method: 'POST',
    handler: h(locationStatus, 'POST'),
    auth: true,
    id: null,
    location: true,
    body: (at) => ({ reading: r(at) }),
  },
  {
    route: 'places/search',
    method: 'POST',
    handler: h(search, 'POST'),
    auth: true,
    id: null,
    location: true,
    body: (at) => ({ reading: r(at) }),
  },
  {
    route: 'places/[id]',
    method: 'POST',
    handler: h(place, 'POST'),
    auth: true,
    id: 'place',
    location: true,
    body: (at) => ({ reading: r(at) }),
  },
  {
    // D206: the ads for a screen; the same location rule as reading it.
    route: 'ads',
    method: 'POST',
    handler: h(ads, 'POST'),
    auth: true,
    id: null,
    location: true,
    body: (at) => ({ reading: r(at), context: { kind: 'feed' }, count: 2 }),
  },
  {
    route: 'ads/views',
    method: 'POST',
    handler: h(adViews, 'POST'),
    auth: true,
    id: null,
    location: false,
    body: () => ({ adIds: ['00000000-0000-7000-8000-000000000000'] }),
  },
  {
    // Any UUID: the guards run before the lookup.
    route: 'ads/[id]/interest',
    method: 'POST',
    handler: h(adInterest, 'POST'),
    auth: true,
    id: 'post',
    location: false,
    body: () => ({ choice: 'INTERESTED' }),
  },
  {
    route: 'feed',
    method: 'POST',
    handler: h(feed, 'POST'),
    auth: true,
    id: null,
    location: true,
    body: (at) => ({ reading: r(at) }),
  },
  {
    route: 'places/[id]/posts/list',
    method: 'POST',
    handler: h(roomList, 'POST'),
    auth: true,
    id: 'place',
    location: true,
    body: (at) => ({ reading: r(at) }),
  },
  {
    route: 'posts/[id]',
    method: 'POST',
    handler: h(postOne, 'POST'),
    auth: true,
    id: 'post',
    location: true,
    body: (at) => ({ reading: r(at) }),
  },
  {
    route: 'business-posts/[id]',
    method: 'POST',
    handler: h(bizPost, 'POST'),
    auth: true,
    id: 'bizPost',
    location: true,
    body: (at) => ({ reading: r(at) }),
  },
  // Location-bound writes
  {
    route: 'posts',
    method: 'POST',
    handler: h(posts, 'POST'),
    auth: true,
    id: null,
    location: true,
    body: (at) => ({ reading: r(at), body: 'x' }),
  },
  {
    route: 'places/[id]/posts',
    method: 'POST',
    handler: h(roomPosts, 'POST'),
    auth: true,
    id: 'place',
    location: true,
    body: (at) => ({ reading: r(at), body: 'x' }),
  },
  // D144: like or dislike a place, only while there.
  {
    route: 'places/[id]/rating',
    method: 'PUT',
    handler: h(placeRating, 'PUT'),
    auth: true,
    id: 'place',
    location: true,
    body: (at) => ({ reading: r(at), value: 1 }),
  },
  {
    route: 'posts/[id]/comments',
    method: 'POST',
    handler: h(postComments, 'POST'),
    auth: true,
    id: 'post',
    location: true,
    body: (at) => ({ reading: r(at), body: 'x' }),
  },
  {
    route: 'business-posts/[id]/comments',
    method: 'POST',
    handler: h(bizComments, 'POST'),
    auth: true,
    id: 'bizPost',
    location: true,
    body: (at) => ({ reading: r(at), body: 'x' }),
  },
  {
    route: 'posts/[id]/vote',
    method: 'PUT',
    handler: h(postVote, 'PUT'),
    auth: true,
    id: 'post',
    location: true,
    body: (at) => ({ reading: r(at), value: 1 }),
  },
  {
    route: 'business-posts/[id]/vote',
    method: 'PUT',
    handler: h(bizVote, 'PUT'),
    auth: true,
    id: 'bizPost',
    location: true,
    body: (at) => ({ reading: r(at), value: 1 }),
  },
  {
    route: 'comments/[id]/vote',
    method: 'PUT',
    handler: h(commentVote, 'PUT'),
    auth: true,
    id: 'comment',
    location: true,
    body: (at) => ({ reading: r(at), value: 1 }),
  },
  // Owner-only edits/deletes (no location: content is already placed)
  {
    route: 'posts/[id]',
    method: 'PATCH',
    handler: h(postOne, 'PATCH'),
    auth: true,
    id: 'post',
    location: false,
    body: () => ({ body: 'edited' }),
  },
  {
    route: 'posts/[id]',
    method: 'DELETE',
    handler: h(postOne, 'DELETE'),
    auth: true,
    id: 'post',
    location: false,
  },
  {
    route: 'business-posts/[id]',
    method: 'PATCH',
    handler: h(bizPost, 'PATCH'),
    auth: true,
    id: 'bizPost',
    location: false,
    body: () => ({ body: 'edited' }),
  },
  {
    route: 'business-posts/[id]',
    method: 'DELETE',
    handler: h(bizPost, 'DELETE'),
    auth: true,
    id: 'bizPost',
    location: false,
  },
  {
    route: 'comments/[id]',
    method: 'PATCH',
    handler: h(comment, 'PATCH'),
    auth: true,
    id: 'comment',
    location: false,
    body: () => ({ body: 'edited' }),
  },
  {
    route: 'comments/[id]',
    method: 'DELETE',
    handler: h(comment, 'DELETE'),
    auth: true,
    id: 'comment',
    location: false,
  },
];

let owner: string; // created the fixtures
let other: string; // a second verified user
const ids: Record<Exclude<Id, null>, string> = {
  place: '',
  post: '',
  bizPost: '',
  comment: '',
  username: 'owner_w',
  friendRequest: '',
  poll: '',
  topic: '',
};

beforeAll(async () => {
  await resetDb();
  await relaxBurstLimits();
  await importServiceArea(db, readBoundaryFile());
  await importOsmPlaces(db, [
    {
      type: 'node',
      id: 1,
      lat: 30.315,
      lon: -81.686,
      tags: { amenity: 'cafe', name: 'Fixture Cafe' },
    },
  ]);
  ids.place = (await db.businessPlace.findFirstOrThrow()).id;
  const o = await createTestUser('owner_w', { emailVerifiedAt: new Date() });
  owner = (await createSession(o.id, 'MOBILE')).token;
  other = (
    await createSession(
      (await createTestUser('other_w', { emailVerifiedAt: new Date() })).id,
      'MOBILE',
    )
  ).token;
  ids.post = (
    await callRoute(h(posts, 'POST'), 'POST', { token: owner, body: { reading: r(IN), body: 'p' } })
  ).body.post.id;
  ids.bizPost = (
    await callRoute(h(roomPosts, 'POST'), 'POST', {
      token: owner,
      id: ids.place,
      body: { reading: r(IN), body: 'b' },
    })
  ).body.post.id;
  ids.comment = (
    await callRoute(h(postComments, 'POST'), 'POST', {
      token: owner,
      id: ids.post,
      body: { reading: r(IN), body: 'c' },
    })
  ).body.id;
  // D76: a request from owner to a third person (only owner may withdraw it).
  const third = await createTestUser('third_w', { emailVerifiedAt: new Date() });
  await db.friendship.create({
    data: {
      userLowId: o.id < third.id ? o.id : third.id,
      userHighId: o.id < third.id ? third.id : o.id,
      requesterId: o.id,
    },
  });
  ids.friendRequest = (await db.friendship.findFirstOrThrow()).id;
  // D125: an open citywide topic.
  ids.topic = (await db.cityTopic.create({ data: { title: 'Game day', status: 'ACTIVE' } })).id;
  // D123: an open poll.
  ids.poll = (
    await db.poll.create({
      data: {
        question: 'Best beach?',
        opensAt: new Date(Date.now() - 3_600_000),
        closesAt: new Date(Date.now() + 86_400_000),
        choices: {
          create: [
            { label: 'Jax Beach', position: 0 },
            { label: 'Neptune', position: 1 },
          ],
        },
      },
    })
  ).id;
  // Lift limits so the table can hit each route several times; limits have their own tests.
  await db.appConfiguration.createMany({
    data: [
      'rateLimit.post.perMinute',
      'rateLimit.post.perDay',
      'rateLimit.comment.perMinute',
      'rateLimit.register.perHourPerIp',
      'rateLimit.installation.perHourPerIp',
      'rateLimit.passwordReset.perHourPerIp',
      'rateLimit.codeAttempt.per15MinPerIp',
      'rateLimit.login.per15MinPerIp',
      'rateLimit.login.per15MinPerAccount',
      'rateLimit.login.perMinutePerIp',
      'rateLimit.login.perMinutePerAccount',
      'rateLimit.verifyEmailResend.perHour',
    ].map((key) => ({ key, value: 1000 })),
  });
});

const call = (row: Row, opts: { token?: string; body?: unknown }) =>
  callRoute(row.handler, row.method, {
    ...opts,
    ...(row.id === 'username'
      ? { params: { username: ids.username } }
      : { id: row.id ? ids[row.id] : undefined }),
  });
const label = (row: Row) => `${row.method} /${row.route}`;

describe('write route table (P3.7)', () => {
  it('lists every POST/PUT/PATCH/DELETE route in src/app/api', () => {
    const root = path.resolve(import.meta.dirname, '../src/app/api/v1');
    const found: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = path.join(dir, name);
        // Admin routes use cookie sessions + CSRF; `admin-routes.test.ts` covers them.
        if (statSync(p).isDirectory()) {
          if (path.relative(root, p) !== 'admin') walk(p);
        } else if (name === 'route.ts') {
          const rel = path.relative(root, dir).split(path.sep).join('/');
          for (const m of readFileSync(p, 'utf8').matchAll(
            /export const (POST|PUT|PATCH|DELETE)\b/g,
          )) {
            found.push(`${m[1]} /${rel}`);
          }
        }
      }
    };
    walk(root);
    expect(found.sort()).toEqual(ROWS.map(label).sort());
  });

  // 🔒 Auth guard first: no session, no access (and no hint about the resource).
  it.each(ROWS.filter((x) => x.auth).map((x) => [label(x), x] as const))(
    '%s → 401 without a session',
    async (_l, row) => {
      const res = await call(row, { body: row.body?.(IN) });
      expect(res.status).toBe(401);
    },
  );

  // 🔒 Strict schemas: fields that would change identity, roles or totals are refused (L5).
  it.each(ROWS.filter((x) => x.body).map((x) => [label(x), x] as const))(
    '%s → 400 for an unexpected field',
    async (_l, row) => {
      const res = await call(row, {
        token: row.auth ? owner : undefined,
        body: { ...row.body!(IN), role: 'ADMIN', userId: 'someone-else' },
      });
      expect(res.status).toBe(400);
    },
  );

  // 🔒 Location: an outside-Duval reading never gets through (L5, L6).
  it.each(ROWS.filter((x) => x.location).map((x) => [label(x), x] as const))(
    '%s → 403 from outside Duval',
    async (_l, row) => {
      const res = await call(row, { token: other, body: row.body!(OUT) });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('LOCATION_OUTSIDE_AREA');
    },
  );

  // 🔒 Ownership: another user can't edit or delete (404, no IDOR hint).
  it.each(
    ROWS.filter(
      (x) =>
        (x.method === 'PATCH' || x.method === 'DELETE') &&
        x.id &&
        x.id !== 'place' &&
        x.id !== 'username' &&
        // D133: unfollowing removes your own follow, not someone else's content.
        x.route !== 'topics/[id]/follow',
    ).map((x) => [label(x), x] as const),
  )('%s → 404 for someone else’s content', async (_l, row) => {
    const res = await call(row, { token: other, body: row.body?.(IN) });
    expect(res.status).toBe(404);
  });
});
