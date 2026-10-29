import { useCallback, useState, type ReactNode } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { DARK } from '@jax/shared';
import { api } from '@/api';
import { ApiRequestError } from '@/api/client';
import { Text } from '@/text';
import { RADIUS, SPACE, TYPE } from '@/tokens';
import { Banner, Button, Field, FormError, PageTitle, Screen } from '@/ui';
import { OwnerTeam } from '@/places/OwnerTeam';

type Method = 'EMAIL' | 'WEBSITE' | 'PHONE';
interface Claim {
  id: string;
  method: Method;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'REVOKED' | 'CANCELLED';
  publicCode: string | null;
  proofUrl: string | null;
  emailDomain: string | null;
  note: string | null;
}
interface Info {
  place: { name: string; website: string | null; phone: string | null };
  claims: Claim[];
}

const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

/**
 * D103: "I own this place". Verify one of three free ways (D92): a code to your business
 * email, a code you post on the business's website or social page, or a call from us to the
 * business's public number. Verified owners get an Owner tag on their posts here only.
 */
export default function OwnerClaimScreen() {
  const { placeId } = useLocalSearchParams<{ placeId: string }>();
  const [info, setInfo] = useState<Info>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [proof, setProof] = useState('');

  const load = useCallback(async () => {
    try {
      setInfo(await api.get<Info>(`/api/v1/places/${placeId}/owner-claims`));
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Couldn’t load.');
    }
  }, [placeId]);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(undefined);
    try {
      await action();
      setCode('');
      await load();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }
  const start = (method: Method) =>
    run(() =>
      api.post(`/api/v1/places/${placeId}/owner-claims`, {
        method,
        ...(method === 'EMAIL' ? { email: email.trim() } : {}),
      }),
    );

  if (!info) {
    return (
      <Screen>
        <PageTitle title="I own this place" icon="storefront-outline" />
        {error ? <FormError>{error}</FormError> : null}
      </Screen>
    );
  }
  const open = info.claims.find((c) => c.status === 'PENDING');
  const verified = info.claims.find((c) => c.status === 'VERIFIED');

  return (
    <Screen keyboard>
      <PageTitle
        title="I own this place"
        subtitle={`Post as “The Owner” in ${info.place.name}’s discussion. Everywhere else you stay yourself.`}
        icon="storefront-outline"
      />
      <FormError>{error}</FormError>

      {verified ? (
        <>
          <Banner icon="checkmark-circle" tone="success">
            You’re a verified owner. In this place’s discussion you post and comment as “The Owner”,
            never your username. No repeated promotions, please.
          </Banner>
          {/* D157: the owner team. */}
          <OwnerTeam placeId={placeId} />
        </>
      ) : open ? (
        <OpenClaim
          claim={open}
          phone={info.place.phone}
          busy={busy}
          code={code}
          setCode={setCode}
          proof={proof}
          setProof={setProof}
          onConfirm={() =>
            void run(() =>
              api.post(`/api/v1/owner-claims/${open.id}/confirm`, { code: code.trim() }),
            )
          }
          onProof={() =>
            void run(() =>
              api.post(`/api/v1/owner-claims/${open.id}/proof`, { proofUrl: proof.trim() }),
            )
          }
          onCancel={() => void run(() => api.post(`/api/v1/owner-claims/${open.id}/cancel`, {}))}
        />
      ) : (
        <View style={{ gap: SPACE.lg }}>
          {info.place.website ? (
            <Choice
              icon="mail-outline"
              title="Business email (fastest)"
              body={`We email a code to an address at ${host(info.place.website)}. Enter it and you’re verified right away.`}
            >
              <Field
                label="Your business email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder={`you@${host(info.place.website)}`}
              />
              <Button title="Send the code" busy={busy} onPress={() => void start('EMAIL')} />
            </Choice>
          ) : null}
          <Choice
            icon="globe-outline"
            title="Code on your website or social page"
            body="We give you a short code to post on the business’s website or official social page for a day. Our team checks it."
          >
            <Button
              variant="secondary"
              title="Get my code"
              busy={busy}
              onPress={() => void start('WEBSITE')}
            />
          </Choice>
          {info.place.phone ? (
            <Choice
              icon="call-outline"
              title="Phone call"
              body={`Our team calls the business’s listed number (${info.place.phone}) and reads you a code to enter here.`}
            >
              <Button
                variant="secondary"
                title="Request a call"
                busy={busy}
                onPress={() => void start('PHONE')}
              />
            </Choice>
          ) : null}
          {[...info.claims]
            .filter((c) => c.status === 'REJECTED' || c.status === 'REVOKED')
            .slice(0, 1)
            .map((c) => (
              <Banner key={c.id} icon="alert-circle-outline" tone="error">
                {c.status === 'REJECTED'
                  ? 'Your last claim wasn’t approved.'
                  : 'Your Owner tag was removed.'}
                {c.note ? ` ${c.note}` : ''}
              </Banner>
            ))}
        </View>
      )}
      <Text style={[TYPE.caption, { color: DARK.textMuted, marginTop: SPACE.lg }]}>
        Work here but don’t own it? Just say “I work here” in your post; there’s no tag for staff.
      </Text>
    </Screen>
  );
}

function Choice({
  icon,
  title,
  body,
  children,
}: {
  icon: 'mail-outline' | 'globe-outline' | 'call-outline';
  title: string;
  body: string;
  children: ReactNode;
}) {
  return (
    <View
      style={{
        padding: SPACE.md,
        borderRadius: RADIUS.lg,
        backgroundColor: DARK.card,
        gap: SPACE.sm,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
        <Ionicons name={icon} size={20} color={DARK.accent} />
        <Text style={{ fontWeight: '800', fontSize: 16 }}>{title}</Text>
      </View>
      <Text style={[TYPE.callout, { color: DARK.textMuted }]}>{body}</Text>
      {children}
    </View>
  );
}

function OpenClaim({
  claim,
  phone,
  busy,
  code,
  setCode,
  proof,
  setProof,
  onConfirm,
  onProof,
  onCancel,
}: {
  claim: Claim;
  phone: string | null;
  busy: boolean;
  code: string;
  setCode: (s: string) => void;
  proof: string;
  setProof: (s: string) => void;
  onConfirm: () => void;
  onProof: () => void;
  onCancel: () => void;
}) {
  return (
    <View style={{ gap: SPACE.md }}>
      {claim.note ? <Banner icon="time-outline">{claim.note}</Banner> : null}
      {claim.method === 'WEBSITE' ? (
        <>
          <Text style={TYPE.body}>
            Post this code on the business’s website or official social page (a post or the “about”
            text is fine), then paste the link:
          </Text>
          <View
            style={{
              padding: SPACE.md,
              borderRadius: RADIUS.md,
              backgroundColor: DARK.raised,
              alignItems: 'center',
            }}
          >
            <Text
              selectable
              style={{ fontSize: 24, fontWeight: '800', letterSpacing: 2, color: DARK.accent }}
            >
              {claim.publicCode}
            </Text>
          </View>
          {claim.proofUrl ? (
            <Banner icon="hourglass-outline">
              Thanks. Our team will check {claim.proofUrl} for the code soon.
            </Banner>
          ) : (
            <>
              <Field
                label="Link to where you posted it"
                value={proof}
                onChangeText={setProof}
                autoCapitalize="none"
                keyboardType="url"
                placeholder="https://"
              />
              <Button title="Send the link" busy={busy} onPress={onProof} />
            </>
          )}
        </>
      ) : (
        <>
          <Text style={TYPE.body}>
            {claim.method === 'EMAIL'
              ? `We sent a 6-digit code to your address at ${claim.emailDomain}. It expires in 30 minutes.`
              : `Our team will call ${phone ?? 'the business'} and read you a 6-digit code. Enter it here.`}
          </Text>
          <Field
            label="6-digit code"
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            maxLength={6}
          />
          <Button title="Verify" busy={busy} onPress={onConfirm} />
        </>
      )}
      <Pressable
        accessibilityRole="button"
        onPress={onCancel}
        style={{ minHeight: 40, justifyContent: 'center' }}
      >
        <Text style={{ color: DARK.accent, fontWeight: '700' }}>
          Cancel this and choose another way
        </Text>
      </Pressable>
      {claim.method === 'WEBSITE' && claim.proofUrl ? (
        <Pressable onPress={() => void Linking.openURL(claim.proofUrl!)}>
          <Text style={[TYPE.caption, { color: DARK.textMuted }]}>Open the link you sent</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
