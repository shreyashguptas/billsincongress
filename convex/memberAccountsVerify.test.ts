/**
 * Run with: `pnpm test`.
 *
 * Reading a member's official home page for the social accounts it links.
 * The links are written as members' sites really write them (checked
 * 2026-11-01); each case is an account that would be wrongly confirmed or
 * wrongly hidden if the reading were off.
 */
import assert from "node:assert/strict";
import { confirmOnPage, isLinkedFrom, isOfficialHost, linkKey, linkedAccounts, looksBlocked } from "./memberAccountsVerify";

let passed = 0;
const failures: string[] = [];

function it(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (err) {
    failures.push(`  ✗ ${name}\n    ${err instanceof Error ? err.message.split("\n").join("\n    ") : String(err)}`);
  }
}

it("reads X and Twitter links the same way, ignoring case and @", () => {
  assert.equal(linkKey("https://x.com/RepAbeHamadeh"), "x:repabehamadeh");
  assert.equal(linkKey("https://twitter.com/RepDerekTranCA"), "x:repderektranca");
  assert.equal(linkKey("https://www.twitter.com/#!/SenSchumer"), "x:senschumer");
  assert.equal(linkKey("https://x.com/@RepFine?lang=en"), "x:repfine");
  assert.equal(linkKey("https://x.com/RepGallagherCA1/"), "x:repgallagherca1");
});

it("skips share and intent links, which are not accounts", () => {
  assert.equal(linkKey("https://twitter.com/intent/tweet?text=hi"), null);
  assert.equal(linkKey("https://twitter.com/share?url=x"), null);
  assert.equal(linkKey("https://www.facebook.com/sharer/sharer.php?u=x"), null);
  assert.equal(linkKey("https://www.youtube.com/watch?v=CcpM4amec8s"), null);
  assert.equal(linkKey("https://www.youtube.com/playlist?list=PL123"), null);
  assert.equal(linkKey("https://www.instagram.com/p/abc123/"), null);
  assert.equal(linkKey("not a url"), null);
});

it("reads every way a site links a Facebook page", () => {
  assert.equal(linkKey("https://www.facebook.com/RepAbeHamadeh/"), "facebook:repabehamadeh");
  assert.equal(linkKey("https://www.facebook.com/profile.php?id=61577293801543"), "facebook:61577293801543");
  assert.equal(linkKey("https://www.facebook.com/people/Rep-Clay-Fuller/61570681866170/"), "facebook:61570681866170");
  assert.equal(linkKey("https://m.facebook.com/pg/RepVanEpps/posts"), "facebook:repvanepps");
  assert.equal(linkKey("https://www.facebook.com/pages/Tom-McClintock/81125319109"), "facebook:81125319109");
  // Posts and photos on a page are not the page.
  assert.equal(linkKey("https://www.facebook.com/135031389892682_1629326505318517"), null);
  assert.equal(linkKey("https://www.facebook.com/photo.php?fbid=1"), null);
});

it("reads YouTube's four kinds of address as four different keys", () => {
  // A channel id is case-sensitive; the names are not.
  assert.equal(linkKey("https://www.youtube.com/channel/UChI1UwZkFRh_Fctl9Ah5z8A"), "youtube:channel:UChI1UwZkFRh_Fctl9Ah5z8A");
  assert.equal(linkKey("https://www.youtube.com/@RepFine"), "youtube:handle:repfine");
  assert.equal(linkKey("https://www.youtube.com/user/tomcoleok04"), "youtube:user:tomcoleok04");
  assert.equal(linkKey("https://www.youtube.com/c/RepJimHimes"), "youtube:c:repjimhimes");
  assert.equal(linkKey("https://www.youtube.com/housedems"), "youtube:custom:housedems");
  // A tab of a channel is still that channel.
  assert.equal(linkKey("https://www.youtube.com/@congresswomanaumuaamata2861/videos"), "youtube:handle:congresswomanaumuaamata2861");
});

it("never counts a link to a post, a tweet or a photo as an account", () => {
  // A home page can embed or mention other people's posts.
  assert.equal(linkKey("https://x.com/HouseGOP/status/1850000000000000000"), null);
  assert.equal(linkKey("https://twitter.com/RepAmata/status/1"), null);
  assert.equal(linkKey("https://www.facebook.com/RepX/posts/123"), null);
  assert.equal(linkKey("https://www.facebook.com/RepX/videos/123"), null);
  assert.equal(linkKey("https://www.instagram.com/repx/p/abc"), null);
  assert.equal(linkKey("https://www.youtube.com/@RepFine/community?lb=x"), "youtube:handle:repfine");
  assert.equal(linkKey("https://www.youtube.com/@RepFine/somethingelse"), null);
});

it("ignores whoever an embedded tweet or post mentions", () => {
  // Rep. Pou's file entry was the House's own @caohouse; an embed must not
  // be able to confirm a mix-up like that.
  const html = `
    <blockquote class="twitter-tweet"><p>Thanks <a href="https://twitter.com/HouseAdmin?ref_src=twsrc%5Etfw">@HouseAdmin</a></p>
      &mdash; Someone (@someone) <a href="https://twitter.com/someone/status/1?ref_src=twsrc%5Etfw">Oct 1</a></blockquote>
    <blockquote class="instagram-media" data-instgrm-permalink="x"><a href="https://www.instagram.com/housecreativeservices/">x</a></blockquote>
    <a class="twitter-timeline" href="https://twitter.com/RepNellie?ref_src=twsrc%5Etfw">Tweets by RepNellie</a>
    <a href="https://www.instagram.com/repnellie/">Instagram</a>`;
  assert.deepEqual([...linkedAccounts(html)].sort(), ["instagram:repnellie", "x:repnellie"]);
});

it("keeps an embed of the member's whole Instagram profile, but not of a post", () => {
  // Rep. Tran's home page embeds his own profile; the embed's inner links
  // are dropped either way.
  const profile = `<blockquote class="instagram-media" data-instgrm-permalink="https://www.instagram.com/repderektran" data-instgrm-version="14"><a href="https://www.instagram.com/someoneelse">x</a></blockquote>`;
  assert.deepEqual([...linkedAccounts(profile)], ["instagram:repderektran"]);
  const post = `<blockquote class="instagram-media" data-instgrm-permalink="https://www.instagram.com/p/ABC123/"><a href="https://www.instagram.com/someoneelse">x</a></blockquote>`;
  assert.deepEqual([...linkedAccounts(post)], []);
});

it("reads protocol-relative links and follow buttons", () => {
  assert.equal(linkKey("//twitter.com/RepA"), "x:repa");
  assert.equal(linkKey("https://twitter.com/intent/follow?screen_name=RepA"), "x:repa");
  assert.equal(linkKey("https://twitter.com/intent/tweet?text=RepA"), null);
});

it("decodes &amp; in hrefs and reads single-quoted ones", () => {
  const html = `<a href='https://x.com/repmichaelrulli'>X</a>
    <a href="https://www.facebook.com/profile.php?id=61577293801543&amp;ref=x">FB</a>`;
  assert.deepEqual([...linkedAccounts(html)].sort(), ["facebook:61577293801543", "x:repmichaelrulli"]);
});

it("confirms only the exact account the page links", () => {
  // Rep. Clarke's site links repyvetteclarke; the volunteer file has a typo.
  const page = linkedAccounts(`<a href="https://www.instagram.com/repyvetteclarke">IG</a>`);
  assert.equal(isLinkedFrom(page, "instagram", "https://www.instagram.com/repyvettedclarke/", "@repyvettedclarke"), false);
  assert.equal(isLinkedFrom(page, "instagram", "https://www.instagram.com/repyvetteclarke/", "@repyvetteclarke"), true);
});

it("sends the reader to the YouTube address the site linked, never one it did not", () => {
  const channel = "https://www.youtube.com/channel/UC-ABttxh8uQv_10qmwGaidw";
  const account = { platform: "youtube" as const, url: channel, label: "@SenatorSchumer" };
  // The site links only the @handle: the reader goes to the @handle, not to
  // the file's channel id, which the site never vouched for.
  const byName = linkedAccounts(`<a href="https://www.youtube.com/@SenatorSchumer">YT</a>`);
  assert.deepEqual(confirmOnPage(byName, account), { url: "https://www.youtube.com/@SenatorSchumer", label: "@SenatorSchumer" });
  // The site links only the channel id: the reader goes there, and the name the
  // site never showed is not printed.
  const byId = linkedAccounts(`<a href="${channel}">YT</a>`);
  assert.deepEqual(confirmOnPage(byId, account), { url: channel, label: "Channel" });
  // Both: the channel, with its name.
  const both = linkedAccounts(`<a href="${channel}">YT</a><a href="https://www.youtube.com/@SenatorSchumer">YT</a>`);
  assert.deepEqual(confirmOnPage(both, account), { url: channel, label: "@SenatorSchumer" });
  // A channel id in another case is another channel.
  const otherCase = linkedAccounts(`<a href="https://www.youtube.com/channel/UC-ABTTXH8UQV_10QMWGAIDW">YT</a>`);
  assert.equal(confirmOnPage(otherCase, account), null);
});

it("sends the reader to the /user/ or /c/ address the site linked, not an @handle of the same word", () => {
  // They are separate namespaces on YouTube: @RepA can be someone else.
  const page = linkedAccounts(`<a href="https://www.youtube.com/user/RepA">YT</a><a href="https://www.youtube.com/c/RepB">YT</a>`);
  assert.deepEqual(confirmOnPage(page, { platform: "youtube", url: "https://www.youtube.com/@RepA", label: "@RepA" }), {
    url: "https://www.youtube.com/user/RepA",
    label: "RepA",
  });
  const channel = { platform: "youtube" as const, url: "https://www.youtube.com/channel/UC-ABttxh8uQv_10qmwGaidw", label: "@RepB" };
  assert.deepEqual(confirmOnPage(page, channel), { url: "https://www.youtube.com/c/RepB", label: "RepB" });
  assert.equal(confirmOnPage(page, { platform: "youtube", url: "https://www.youtube.com/@RepC", label: "@RepC" }), null);
});

it("accepts only https house.gov and senate.gov as the page a check read", () => {
  assert.equal(isOfficialHost("https://rulli.house.gov/"), true);
  assert.equal(isOfficialHost("https://www.schumer.senate.gov/"), true);
  assert.equal(isOfficialHost("https://rulliforcongress.com/"), false);
  assert.equal(isOfficialHost("https://house.gov.example.com/"), false);
  assert.equal(isOfficialHost("http://rulli.house.gov/"), false);
});

it("does not confirm an account from a different platform with the same name", () => {
  const page = linkedAccounts(`<a href="https://www.instagram.com/repfine/">IG</a>`);
  assert.equal(isLinkedFrom(page, "x", "https://x.com/repfine", "@repfine"), false);
});

it("recognises a firewall's refusal page", () => {
  assert.equal(looksBlocked("<html><head><title>Senate.gov - Unauthorized</title>"), true);
  assert.equal(looksBlocked("<title>Access Denied</title>"), true);
  assert.equal(looksBlocked("<title>Representative Abe Hamadeh</title>"), false);
});

console.log(`\nmemberAccountsVerify: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
