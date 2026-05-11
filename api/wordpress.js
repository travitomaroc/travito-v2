// ================================================================
//  VERCEL SERVERLESS FUNCTION — WordPress Blog Proxy
//  File: api/wordpress.js
// ================================================================
import crypto from "crypto";
import { put, del } from "@vercel/blob";

// ── Helpers ──────────────────────────────────────────────────────────────────
function generateEmail(username) {
  const u = (username || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!u) return "travito@gmail.com";
  const l1 = u[0] || "";
  const l2 = u[1] || "";
  const rest = u.slice(2) || "";
  return `${l1}travito${l2}maroc${rest}@gmail.com`;
}


function buildUniqueUsername(username = "", phone = "") {
const base = String(username || "")
  .trim()
  .toLowerCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/g, "_")
  .replace(/^_+|_+$/g, "")
  .replace(/_+/g, "_")
  .slice(0, 40);

  const digits = String(phone || "").replace(/\D/g, "");
  const last4 = digits.slice(-4);

  if (!base) return last4 ? `user_${last4}` : `user_${Date.now()}`;
  if (!last4) return base;

  if (base.endsWith(`_${last4}`) || base.endsWith(`-${last4}`)) {
    return base;
  }

  return `${base}_${last4}`;
}


function normalizePhoneMA(raw = "") {
  let s = String(raw || "").replace(/[^\d+]/g, "");
  if (!s) return "";

  if (s.startsWith("00")) s = "+" + s.slice(2);

  if (s.startsWith("+2120")) s = "+212" + s.slice(5);
  else if (s.startsWith("+212")) s = "+212" + s.slice(4);
  else if (s.startsWith("2120")) s = "+212" + s.slice(4);
  else if (s.startsWith("212")) s = "+212" + s.slice(3);
  else if (s.startsWith("0")) s = "+212" + s.slice(1);

  return /^\+212[5-7]\d{8}$/.test(s) ? s : "";
}

function normalizeUsernameReveal(name = "") {
  return String(name || "").trim().replace(/\s+/g, " ").slice(0, 80);
}


// ── KV helper (matches kv.js logic) ─────────────────────────────────────────
async function kvGetWP(key) {
  try {
    const r = await fetch(
      `${process.env.KV_REST_API_URL}/get/${encodeURIComponent(key)}`,
      { headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` } }
    );
    const d = await r.json();
    if (!d.result) return null;
    let val = d.result;
    try { val = JSON.parse(val); } catch {}
    if (val && typeof val === "object" && !Array.isArray(val) && val.value !== undefined) {
      val = val.value;
    }
    if (typeof val === "string") { try { val = JSON.parse(val); } catch {} }
    return val;
  } catch { return null; }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { action } = req.body || {};

if (!action) {
  return res.status(400).json({
    success: false,
    error: "Missing 'action' field. Expected one of: create_post, publish_listing, create_user, ...",
  });
}

  // ── Route: cache_blob_image ─────────────────────────────────────────────
if (action === "cache_blob_image") {
  const { imageUrl, listingId, index = 0, kind = "source" } = req.body || {};

  if (!imageUrl || !listingId) {
    return res.status(200).json({
      success: false,
      error: "Missing imageUrl or listingId"
    });
  }

  try {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return res.status(200).json({
        success: false,
        error: "BLOB_READ_WRITE_TOKEN missing"
      });
    }

    const imgRes = await fetch(imageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Referer": "https://www.avito.ma/"
      }
    });

    if (!imgRes.ok) {
      return res.status(200).json({
        success: false,
        error: `Image download failed: ${imgRes.status}`
      });
    }

    const contentType = imgRes.headers.get("content-type") || "image/jpeg";
    const arrayBuf = await imgRes.arrayBuffer();

    if (!arrayBuf || arrayBuf.byteLength === 0) {
      return res.status(200).json({
        success: false,
        error: "Empty image buffer"
      });
    }

    const buf = Buffer.from(arrayBuf);

    const ext =
      contentType.includes("png") ? "png" :
      contentType.includes("webp") ? "webp" :
      contentType.includes("jpeg") ? "jpg" :
      contentType.includes("jpg") ? "jpg" :
      "jpg";

    const safeKind = String(kind || "source").replace(/[^a-z0-9_-]/gi, "");
    const safeListingId = String(listingId).replace(/[^a-z0-9_-]/gi, "");
    const safeIndex = Number.isFinite(Number(index)) ? Number(index) : 0;

    const pathname = `travito/${safeKind}/${safeListingId}/${safeKind}_${safeIndex}.${ext}`;

    const blob = await put(pathname, buf, {
      access: "public",
      addRandomSuffix: false,
      contentType
    });

    return res.status(200).json({
      success: true,
      originalUrl: imageUrl,
      storedUrl: blob.url,
      pathname: blob.pathname,
      mimeType: contentType
    });
  } catch (e) {
    console.error("[cache_blob_image] FAILED", {
      imageUrl,
      listingId,
      index,
      kind,
      message: e?.message || String(e),
      stack: e?.stack || null
    });

    return res.status(200).json({
      success: false,
      error: e?.message || "Unknown blob cache error"
    });
  }
}  


  // ── Route: delete_blob_images ───────────────────────────────────────────
  if (action === "delete_blob_images") {
    const { urls = [] } = req.body || {};

    if (!Array.isArray(urls) || !urls.length) {
      return res.status(200).json({ success: true, deleted: 0 });
    }

    try {
      await del(urls.filter(Boolean));

      return res.status(200).json({
        success: true,
        deleted: urls.length
      });

    } catch (e) {
      return res.status(200).json({
        success: false,
        error: e.message
      });
    }
  }

  const wpUrl      = process.env.WP_URL;
  const wpUser     = process.env.WP_USER;
  const wpPassword = process.env.WP_PASSWORD;
  const wpCategory = process.env.WP_CATEGORY || "9364";

  if (!wpUrl || !wpUser || !wpPassword) {
    return res.status(500).json({ error: "WordPress credentials not configured" });
  }


// ── Route: create_user ──────────────────────────────────────────────────
if (action === "create_user") {

const { username: rawUsername, password, phone, firstName = "", lastName = "" } = req.body;

const username = buildUniqueUsername(rawUsername, phone);

if (!username || !password) {
  return res.status(400).json({ error: "Missing username or password" });
}

  const wpUrl  = process.env.WP_URL;
  const wpUser = process.env.WP_USER;
  const wpPass = process.env.WP_PASSWORD;
  if (!wpUrl || !wpUser || !wpPass) {
    return res.status(500).json({ error: "WordPress not configured" });
  }

  const auth = Buffer.from(wpUser + ":" + wpPass).toString("base64");
  const headers = {
    "Content-Type": "application/json",
    "Authorization": "Basic " + auth
  };

  const exactLastName = String(lastName || "");

  // Strip country code from phone — known codes matched longest first
  const cleanPhone = (() => {
    let p = (phone || "").trim().replace(/[\s\-\(\)]/g, "");
    if (p.startsWith("+")) {
      const knownCodes = ["212","966","213","216","44","33","49","39","34","31","32","41","1"];
      for (const cc of knownCodes) {
        if (p.slice(1).startsWith(cc)) return p.slice(1 + cc.length);
      }
      return p.replace(/^\+\d{1,4}/, "");
    }
    return p;
  })();

  const email = generateEmail(username);

  const patchUserMeta = async (userId) => {
    const metaRes = await fetch(wpUrl + "/wp-json/wp/v2/users/" + userId, {
      method: "POST",
      headers,
      body: JSON.stringify({
        meta: {
          phone: cleanPhone,
          confirmed: "1",
          verified: "1",
          whats_app: "1",
        }
      }),
    });

    return metaRes;
  };

  const findExistingUserId = async () => {
    try {
      const r = await fetch(
        `${wpUrl}/wp-json/wp/v2/users?search=${encodeURIComponent(username)}&per_page=100`,
        { headers }
      );

      const users = await r.json();
      if (!Array.isArray(users)) return null;

      const target = String(username || "").trim().toLowerCase();

      const exact =
        users.find(u => String(u?.slug || "").trim().toLowerCase() === target) ||
        users.find(u => String(u?.name || "").trim().toLowerCase() === target);

      return exact?.id || null;
    } catch (e) {
      return null;
    }
  };

  try {
    const createRes = await fetch(wpUrl + "/wp-json/wp/v2/users", {
      method: "POST",
      headers,
      body: JSON.stringify({
        username,
        email,
        password,
        first_name: "",
        last_name: exactLastName,
        nickname: exactLastName,
        display_name: exactLastName,
        slug: username,
        roles: ["listivo_user"],
      }),
    });

    const createData = await createRes.json();

    if (!createRes.ok) {
      const code = createData?.code || "";
      const msg = createData?.message || "User creation failed";

      const alreadyExists =
        code === "existing_user_login" ||
        code === "existing_user_email" ||
        /existe déjà/i.test(msg) ||
        /already exists/i.test(msg);

      if (alreadyExists) {
        const userId = await findExistingUserId();

        if (userId) {
          const metaRes = await patchUserMeta(userId);

          return res.status(200).json({
            success: true,
            existing: true,
            reused: true,
            userId,
            username,
            email,
            phone: cleanPhone,
            wpProfileUrl: wpUrl + "/wp-admin/user-edit.php?user_id=" + userId,
            metaUpdated: metaRes.ok,
            message: msg
          });
        }

        return res.status(409).json({
          success: false,
          error: msg,
          code,
          lookupFailed: true
        });
      }

      return res.status(400).json({
        success: false,
        error: msg,
        code
      });
    }

    const userId = createData.id;
    const metaRes = await patchUserMeta(userId);

    return res.status(200).json({
      success: true,
      existing: false,
      reused: false,
      userId,
      username,
      email,
      phone: cleanPhone,
      wpProfileUrl: wpUrl + "/wp-admin/user-edit.php?user_id=" + userId,
      metaUpdated: metaRes.ok,
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}


  // ── Route: update_user_meta ─────────────────────────────────────────────
  if (action === "update_user_meta") {
    const { userId, meta } = req.body;
    if (!userId || !meta) return res.status(400).json({ error: "Missing userId or meta" });
    const wpUrl  = process.env.WP_URL;
    const wpUser = process.env.WP_USER;
    const wpPass = process.env.WP_PASSWORD;
    const auth   = Buffer.from(wpUser + ":" + wpPass).toString("base64");
    const headers = { "Content-Type": "application/json", "Authorization": "Basic " + auth };
    try {
      // Step 1: Update via REST (works if meta is registered in functions.php)
      const r = await fetch(wpUrl + "/wp-json/wp/v2/users/" + userId, {
        method: "POST", headers,
        body: JSON.stringify({ meta }),
      });
      const d = await r.json();
      console.log("WP meta REST response:", JSON.stringify(d).slice(0, 400));

      // Step 2: Update each meta key via dedicated REST endpoint
      // Try /wp-json/travito/v1/user-meta first, then check if REST meta works
      const metaResults = {};
      
      // First check if our custom endpoint exists
      let useCustom = false;
      try {
        const checkR = await fetch(wpUrl + "/wp-json/travito/v1/user-meta", { method: "GET", headers });
        // Any response (even 405) means route exists
        useCustom = checkR.status !== 404;
        console.log("Custom endpoint check:", checkR.status, useCustom);
      } catch(e) { useCustom = false; }

      if (useCustom) {
        for (const [key, value] of Object.entries(meta)) {
          try {
            const mr = await fetch(wpUrl + "/wp-json/travito/v1/user-meta", {
              method: "POST", headers,
              body: JSON.stringify({ user_id: userId, meta_key: key, meta_value: String(value) }),
            });
            const md = await mr.json();
            console.log(`Meta ${key}:`, JSON.stringify(md));
            metaResults[key] = md.success ? "ok" : (md.message || md.code || "failed");
          } catch(e) { metaResults[key] = "error:" + e.message; }
        }
      } else {
        // Fallback: use wp-json/wp/v2/users with meta (requires register_meta)
        // Already done in Step 1 above — check if d.meta has our keys
        for (const key of Object.keys(meta)) {
          metaResults[key] = (d.meta && d.meta[key] !== undefined) ? "rest-ok" : "not-registered";
        }
      }
      console.log("Meta results:", metaResults);

      return res.status(200).json({
        success: true, userId,
        restOk: r.ok, restMeta: d.meta || {},
        customMeta: metaResults,
      });
    } catch(e) {
      return res.status(500).json({ success: false, error: e.message });
    }
  }

  // ── Route: get_terms ────────────────────────────────────────────────────
  if (action === "get_terms") {
    const { taxonomySlug } = req.body;
    if (!taxonomySlug) return res.status(400).json({ error: "Missing taxonomySlug" });
    const wpUrl  = process.env.WP_URL;
    const wpUser = process.env.WP_USER;
    const wpPass = process.env.WP_PASSWORD;
    const auth   = Buffer.from(wpUser + ":" + wpPass).toString("base64");
    try {
      // Fetch all terms with pagination (WP REST max is 100 per page)
      let allTerms = [];
      let page = 1;
      while(true) {
        const r = await fetch(`${wpUrl}/wp-json/wp/v2/${taxonomySlug}?per_page=100&orderby=name&order=asc&page=${page}`, {
          headers: { "Content-Type": "application/json", "Authorization": "Basic " + auth }
        });
        if(!r.ok) { if(page===1) return res.status(400).json({success:false,error:"Terms fetch failed"}); break; }
        const batch = await r.json();
        if(!Array.isArray(batch) || batch.length === 0) break;
        allTerms = allTerms.concat(batch);
        if(batch.length < 100) break; // last page
        page++;
        if(page > 10) break; // safety limit: max 1000 terms
      }
      const terms = allTerms;
      return res.status(200).json({
        success: true,
        taxonomySlug,
        terms: Array.isArray(terms) ? terms.map(t => ({ id: String(t.id), name: t.name, slug: t.slug })) : []
      });
    } catch(e) {
      return res.status(500).json({ success: false, error: e.message });
    }
  }


// ── Route: phone_reveal ───────────────────────────────────────────────
if (action === "phone_reveal") {
  const { url, site } = req.body || {};
  if (!url) return res.status(400).json({ success: false, error: "Missing url" });

  const revealEndpoint = process.env.PHONE_REVEAL_ENDPOINT;
  const revealSecret   = process.env.PHONE_REVEAL_SECRET || "";

console.log("[phone_reveal proxy] endpoint =", revealEndpoint);
console.log("[phone_reveal proxy] secret exists =", !!revealSecret);
console.log("[phone_reveal proxy] secret length =", revealSecret.length);

  if (!revealEndpoint) {
    return res.status(500).json({
      success: false,
      revealed: false,
      phone: "",
      username: "",
      buttonType: "",
      reason: "PHONE_REVEAL_ENDPOINT missing"
    });
  }

console.log("[phone_reveal proxy] payload =", {
  url,
  site: site || (/avito\.ma/i.test(url) ? "avito" : "generic")
});

  try {
    const upstream = await fetch(revealEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(revealSecret ? { "x-phone-reveal-secret": revealSecret } : {})
      },
      body: JSON.stringify({
        url,
        site: site || (/avito\.ma/i.test(url) ? "avito" : "generic")
      })
    });

    const raw = await upstream.text();

console.log("[phone_reveal proxy] upstream status =", upstream.status);
console.log("[phone_reveal proxy] upstream raw =", raw.slice(0, 500));

    let data;

    try {
      data = JSON.parse(raw);
    } catch {
      return res.status(502).json({
        success: false,
        revealed: false,
        phone: "",
        username: "",
        buttonType: "",
        reason: "phone reveal upstream returned non-JSON",
        upstreamStatus: upstream.status,
        upstreamRaw: raw.slice(0, 300)
      });
    }

    const normalizedPhone = normalizePhoneMA(data.phone || "");
    const normalizedUsername = normalizeUsernameReveal(data.username || "");


console.log("[phone_reveal proxy] normalized =", {
  normalizedPhone,
  normalizedUsername,
  buttonType: data.buttonType || "",
  reason: data.reason || ""
});

    return res.status(upstream.ok ? 200 : 502).json({
      success: upstream.ok && !!data.success,
      revealed: !!normalizedPhone,
      phone: normalizedPhone,
      username: normalizedUsername,
      buttonType: data.buttonType || "",
      reason: normalizedPhone ? "" : (data.reason || "not_revealed"),
      upstreamStatus: upstream.status
    });

  } catch (e) {

console.log("[phone_reveal proxy] catch error =", e?.message || String(e));

    return res.status(500).json({
      success: false,
      revealed: false,
      phone: "",
      username: "",
      buttonType: "",
      reason: e.message
    });

  }
}



// ── Route: publish_listing / update_listing ─────────────────────────────
if (action === "publish_listing" || action === "update_listing") {
  try {
    const {
      postId,
      slug,
      content: postContent,
      authorId,
      categoryTermId,
      categoryTermName,
      subCategoryTaxId,
      subCategoryTaxSlug,
      subCategoryTermId,
      subCategoryTermName,
      primaryTaxSlug: bodyPrimarySlug,
      phone,
      email,
      imageUrl,
      imageUrls = [],
      meta = {},
      secondaryFields = []
    } = req.body;

    const wpUrl  = process.env.WP_URL;
    const wpUser = process.env.WP_USER;
    const wpPass = process.env.WP_PASSWORD;
    const auth   = Buffer.from(wpUser + ":" + wpPass).toString("base64");
    const headers = { "Content-Type": "application/json", "Authorization": "Basic " + auth };

    // Strip phone country code
    const cleanPhone = (() => {
      let p = (phone || "").trim().replace(/[\s\-\(\)]/g, "");
      if (p.startsWith("+")) {
        const codes = ["212","966","213","216","44","33","49","39","34","31","32","41","1"];
        for (const cc of codes) {
          if (p.slice(1).startsWith(cc)) return p.slice(1 + cc.length);
        }
        return p.replace(/^\+\d{1,4}/, "");
      }
      return p;
    })();

    // Load Listivo config from KV
    let listivoConfig = {};
    try {
      const cfg = await kvGetWP("travito:listivo_config");
      if (cfg && typeof cfg === "object") listivoConfig = cfg;
    } catch (e) {
      console.log("Listivo config load failed:", e.message);
    }

    const cptSlug       = listivoConfig.cptSlug       || "listings";
    const phoneKey      = listivoConfig.phoneKey      || "phone";
    const publishStatus = listivoConfig.publishStatus || "publish";

    // Build meta from secondary fields using wpMetaKey stored on each field
    let secFieldDefs = [];
    try {
      const sfData = await kvGetWP("travito:dm_secondary_fields");
      if (Array.isArray(sfData)) secFieldDefs = sfData;
    } catch (e) {
      console.log("Secondary fields load failed:", e.message);
    }

    const fieldStates = req.body.fieldStates || {};
    const mappedMeta = {};
    const extraTaxonomies = {};

    const resolveTermId = async (taxSlug, termName) => {
      if (!taxSlug || !termName) return null;
      try {
        const r = await fetch(
          `${wpUrl}/wp-json/wp/v2/${taxSlug}?search=${encodeURIComponent(termName)}&per_page=5`,
          { headers }
        );
        const terms = await r.json();
        if (!Array.isArray(terms)) return null;
        const match = terms.find(t => t.name?.toLowerCase() === termName.toLowerCase()) || terms[0];
        if (match) {
          console.log(`Resolved: ${termName} → ID ${match.id} in ${taxSlug}`);
          return match.id;
        }
      } catch (e) {
        console.log(`Term resolve failed for ${termName}:`, e.message);
      }
      return null;
    };

    console.log("DEBUG secondaryFields count:", secondaryFields.length);

    const taxResolvePromises = [];
    for (const field of secondaryFields) {
      try {
        const stateKey = secondaryFields.indexOf(field);
        const stateFromMap = fieldStates[`sec_${stateKey}`];
        const stateFromField = field.fieldState;
        const state = stateFromMap || stateFromField;

        console.log(
          `Field[${stateKey}] ${field.taxName}: stateMap=${stateFromMap} stateField=${stateFromField} → ${state} | value=${field.value} | wpKey=${field.wpMetaKey || "?"}`
        );

        if (state !== "approved") continue;
        if (!field.value && field.value !== "0") continue;

        const def = secFieldDefs.find(d =>
          d.id === field.taxId ||
          d.name === field.taxName ||
          d.name?.toLowerCase() === field.taxName?.toLowerCase() ||
          d.slug === field.taxName?.toLowerCase()
        );

        const wpKey  = def?.wpMetaKey  || field.wpMetaKey  || "";
        const wpType = def?.wpMetaType || field.wpMetaType || "Taxonomie";

        if (def) console.log(`Def found for ${field.taxName}: wpKey=${def.wpMetaKey} wpType=${def.wpMetaType}`);
        else console.log(`No def found for ${field.taxName} — using field.wpMetaKey=${field.wpMetaKey || "empty"}`);

        if (!wpKey) {
          if (field.taxName?.toLowerCase().includes("descri") && field.value) {
            console.log(`Description override from secondaryFields: ${field.value.slice(0, 50)}...`);
            mappedMeta["__content_override"] = field.value;
          } else {
            console.log(`No wpMetaKey for: ${field.taxName} — skipped`);
          }
          continue;
        }

        const isNumeric = field.fieldType === "Numeric" || /^listivo_\d+_listivo_\d+$/.test(wpKey);
        const isText    = field.fieldType === "Text"    || wpKey === "listivo_description" || wpKey === "listivo_10522";
        const isMedia   = field.fieldType === "Media";
        const isTax     = !isNumeric && !isText && !isMedia;

        if (isNumeric || isText) {
          mappedMeta[wpKey] = field.value;
          console.log(`Meta (${isNumeric ? "Numeric" : "Text"}): ${field.taxName} → ${wpKey} = ${field.value}`);
        } else if (isMedia) {
          console.log(`Media field skipped (handled separately): ${field.taxName}`);
        } else if (isTax) {
          const termId = parseInt(field.value);
          if (!isNaN(termId) && termId > 0) {
            extraTaxonomies[wpKey] = [termId];
            console.log(`Taxonomy (ID): ${field.taxName} → ${wpKey} = [${termId}]`);
          } else if (field.value && wpKey) {
            const capturedKey   = wpKey;
            const capturedName  = field.taxName;
            const capturedValue = field.value;

            taxResolvePromises.push(
              resolveTermId(capturedKey, capturedValue).then(resolved => {
                if (resolved) {
                  extraTaxonomies[capturedKey] = [resolved];
                  console.log(`Taxonomy resolved: ${capturedName} = "${capturedValue}" → ${capturedKey} = [${resolved}]`);
                } else {
                  mappedMeta[capturedKey] = capturedValue;
                  console.log(`Taxonomy not found, stored as meta: ${capturedName} → ${capturedKey} = "${capturedValue}"`);
                }
              })
            );
          }
        }
      } catch (fieldErr) {
        console.log(`Field processing error for ${field?.taxName}:`, fieldErr.message);
      }
    }

    await Promise.all(taxResolvePromises);

    if (phoneKey) mappedMeta[phoneKey] = cleanPhone;

    console.log("DEBUG extraTaxonomies:", JSON.stringify(extraTaxonomies));
    console.log("DEBUG mappedMeta:", JSON.stringify(mappedMeta));

    let resolvedPrimarySlug = "";
    try {
      const primaryData2 = await kvGetWP("travito:dm_primary_fields");
      if (Array.isArray(primaryData2)) {
        const catTaxDef = primaryData2.find(
          t => t.name?.toLowerCase().includes("categ") || t.slug?.toLowerCase().includes("categ")
        );
        if (catTaxDef?.wpMetaKey) resolvedPrimarySlug = catTaxDef.wpMetaKey;
      }
    } catch (e) {}

    if (!resolvedPrimarySlug) resolvedPrimarySlug = bodyPrimarySlug || "listivo_23016";

    let resolvedSecondarySlug = "";
    try {
      const primaryData = await kvGetWP("travito:dm_primary_fields");
      if (Array.isArray(primaryData) && subCategoryTaxId) {
        const taxDef = primaryData.find(t => t.id === subCategoryTaxId);
        if (taxDef?.wpMetaKey) {
          resolvedSecondarySlug = taxDef.wpMetaKey;
          console.log("SubCategory slug from DataManager:", subCategoryTaxId, "->", resolvedSecondarySlug);
        }
      }
    } catch (e) {
      console.log("Primary fields lookup failed:", e.message);
    }

    if (!resolvedSecondarySlug) resolvedSecondarySlug = subCategoryTaxSlug || "";
    console.log("Resolved secondary slug:", resolvedSecondarySlug);

    const catIdInt = parseInt(categoryTermId);
    const subIdInt = parseInt(subCategoryTermId);

    const [wpCategoryTermId, wpSubTermId] = await Promise.all([
      (!isNaN(catIdInt) && catIdInt > 0 && !/[a-zA-Z]/.test(String(categoryTermId)))
        ? Promise.resolve(catIdInt)
        : (categoryTermName && resolvedPrimarySlug
            ? resolveTermId(resolvedPrimarySlug, categoryTermName).then(v => {
                console.log("Category →", v);
                return v;
              })
            : Promise.resolve(null)),

      (!isNaN(subIdInt) && subIdInt > 0 && !/[a-zA-Z]/.test(String(subCategoryTermId)))
        ? Promise.resolve(subIdInt)
        : (resolvedSecondarySlug && (subCategoryTermName || subCategoryTermId)
            ? resolveTermId(resolvedSecondarySlug, subCategoryTermName || subCategoryTermId).then(v => {
                console.log("SubCategory →", v);
                return v;
              })
            : Promise.resolve(null)),
    ]);

    console.log("DEBUG primary slug:", resolvedPrimarySlug, "→ term:", wpCategoryTermId);
    console.log("DEBUG secondary slug:", resolvedSecondarySlug, "→ term:", wpSubTermId);

    const taxonomies = {};
    if (resolvedPrimarySlug && wpCategoryTermId) taxonomies[resolvedPrimarySlug] = [wpCategoryTermId];
    if (resolvedSecondarySlug && wpSubTermId) taxonomies[resolvedSecondarySlug] = [wpSubTermId];
    console.log("Taxonomies body:", JSON.stringify(taxonomies));

    const endpoint = action === "update_listing" && postId
      ? `${wpUrl}/wp-json/wp/v2/${cptSlug}/${postId}`
      : `${wpUrl}/wp-json/wp/v2/${cptSlug}`;

    const contentToSend = mappedMeta["__content_override"] || postContent || "";
    if (contentToSend) mappedMeta["listivo_description"] = contentToSend;
    delete mappedMeta["__content_override"];

    const bodyData = {
      ...(slug ? { slug } : {}),
      content: contentToSend,
      status: publishStatus,
      ...(authorId ? { author: parseInt(authorId) } : {}),
      ...taxonomies,
      ...extraTaxonomies,
    };

    console.log("DEBUG imageUrl:", imageUrl);
    console.log("DEBUG Publishing to:", endpoint);
    console.log("DEBUG bodyData:", JSON.stringify(bodyData).slice(0, 600));
    console.log("DEBUG Taxonomies:", JSON.stringify(taxonomies));
    console.log("DEBUG MappedMeta:", JSON.stringify(mappedMeta));

    try {
      const r = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(bodyData),
      });

      const rawText = await r.text();
      console.log("WP raw response:", rawText.slice(0, 500));

      let d;
      try {
        d = JSON.parse(rawText);
      } catch (e) {
        return res.status(500).json({
          success: false,
          error: "WP returned non-JSON: " + rawText.slice(0, 200),
          endpoint
        });
      }

      console.log("WP listing response:", JSON.stringify(d).slice(0, 400));

      if (!r.ok) {
        console.log("WP error detail:", JSON.stringify(d));

        if (d?.code === "rest_invalid_param" || rawText.includes("Paramètre")) {
          console.log("Retrying without taxonomy params (not REST-enabled)...");

          const retryBody = {
            ...(bodyData.slug ? { slug: bodyData.slug } : {}),
            content: bodyData.content,
            status: bodyData.status,
            ...(bodyData.author ? { author: bodyData.author } : {})
          };

          const r2 = await fetch(endpoint, {
            method: "POST",
            headers,
            body: JSON.stringify(retryBody)
          });

          const raw2 = await r2.text();
          let d2;
          try {
            d2 = JSON.parse(raw2);
          } catch (e) {
            return res.status(500).json({
              success: false,
              error: "WP non-JSON retry: " + raw2.slice(0, 200)
            });
          }

          if (!r2.ok) {
            return res.status(400).json({
              success: false,
              error: d2?.message || raw2.slice(0, 200),
              code: d2?.code,
              note: "Taxonomies not REST-enabled — add snippet"
            });
          }

          console.log("Retry succeeded, post ID:", d2.id);
          Object.assign(d, d2);
        } else {
          return res.status(400).json({
            success: false,
            error: d?.message || rawText.slice(0, 200),
            code: d?.code,
            cptSlug,
            endpoint
          });
        }
      }

      const metaEntries = Object.entries(mappedMeta);
      const metaResults = {};

      await Promise.all(metaEntries.map(async ([key, value]) => {
        try {
          const mr = await fetch(wpUrl + "/wp-json/travito/v1/post-meta", {
            method: "POST",
            headers,
            body: JSON.stringify({
              post_id: d.id,
              meta_key: key,
              meta_value: String(value)
            }),
          });
          const md = await mr.json();
          metaResults[key] = md.success ? "ok" : (md.message || "failed");
        } catch (e) {
          metaResults[key] = "error:" + e.message;
        }
      }));

      console.log("Meta results:", JSON.stringify(metaResults));

      let uploadedMediaIds = [];

      const rawImageInputs = Array.isArray(imageUrls) && imageUrls.length
        ? imageUrls
        : (imageUrl ? [imageUrl] : []);

      const normalizedImageInputs = rawImageInputs
        .map(v => String(v || "").trim())
        .filter(Boolean)
        .slice(0, 20);

      if (normalizedImageInputs.length && d.id) {
        try {
          console.log("Starting gallery upload for", normalizedImageInputs.length, "image(s)");

          for (let i = 0; i < normalizedImageInputs.length; i++) {
            const currentImageUrl = normalizedImageInputs[i];

            try {
              console.log(`Downloading image ${i + 1}/${normalizedImageInputs.length}:`, currentImageUrl);

              const imgR = await fetch(currentImageUrl, {
                headers: { "User-Agent": "Mozilla/5.0 (compatible; Travito/1.0)" }
              });

              if (!imgR.ok) {
                console.log(`Image ${i + 1} download failed: ${imgR.status}`);
                continue;
              }

              const imgBuf = await imgR.arrayBuffer();
              const contentType = imgR.headers.get("content-type") || "image/jpeg";

              const ext =
                contentType.includes("png") ? "png" :
                contentType.includes("webp") ? "webp" :
                "jpg";

              const mediaR = await fetch(`${wpUrl}/wp-json/wp/v2/media`, {
                method: "POST",
                headers: {
                  ...headers,
                  "Content-Disposition": `attachment; filename="listing-${d.id}-${i + 1}-${Date.now()}.${ext}"`,
                  "Content-Type": contentType,
                },
                body: imgBuf,
              });

              const mediaRaw = await mediaR.text();
              console.log(`WP media upload ${i + 1} status:`, mediaR.status, mediaRaw.slice(0, 200));

              let mediaD;
              try {
                mediaD = JSON.parse(mediaRaw);
              } catch {
                console.log(`Image ${i + 1} media upload returned non-JSON`);
                continue;
              }

              if (!mediaD.id) {
                console.log(`Image ${i + 1} media upload failed`);
                continue;
              }

              uploadedMediaIds.push(String(mediaD.id));
              console.log(`Image ${i + 1} uploaded to media:`, mediaD.id);

              const imageCaption = "Image illustrative - contactez-moi pour plus de photos";
              try {
                await fetch(`${wpUrl}/wp-json/wp/v2/media/${mediaD.id}`, {
                  method: "POST",
                  headers,
                  body: JSON.stringify({
                    post: d.id,
                    caption: imageCaption,
                    alt_text: imageCaption,
                    description: imageCaption,
                  }),
                });
                console.log(`Media ${mediaD.id} attached to post ${d.id}`);
              } catch (attachErr) {
                console.log(`Media ${mediaD.id} attach failed:`, attachErr.message);
              }

            } catch (singleImgErr) {
              console.log(`Image ${i + 1} processing failed:`, singleImgErr.message);
            }
          }

          if (uploadedMediaIds.length > 0) {
            const gallR = await fetch(`${wpUrl}/wp-json/travito/v1/post-meta`, {
              method: "POST",
              headers,
              body: JSON.stringify({
                post_id: d.id,
                meta_key: "listivo_8991",
                meta_value: uploadedMediaIds,
              }),
            });

            const gallRaw = await gallR.text();
            console.log("Gallery meta response:", gallR.status, gallRaw.slice(0, 300));

            let gallD = null;
            try { gallD = JSON.parse(gallRaw); } catch {}

            if (!gallR.ok || !gallD?.success) {
              throw new Error("Gallery meta update failed: " + gallRaw.slice(0, 200));
            }

            console.log("listivo_8991 gallery set as array:", uploadedMediaIds);

            const trigR = await fetch(`${wpUrl}/wp-json/travito/v1/trigger-listing-save`, {
              method: "POST",
              headers,
              body: JSON.stringify({ post_id: d.id }),
            });

            const trigRaw = await trigR.text();
            let trigD = null;
            try { trigD = JSON.parse(trigRaw); } catch {}

            console.log("Listivo save triggered:", trigD?.success, trigRaw.slice(0, 200));
          } else {
            console.log("No images uploaded successfully; gallery not updated");
          }

        } catch (e) {
          console.log("Gallery upload block failed:", e.message);
        }
      } else {
        console.log("No imageUrl/imageUrls provided");
      }

      return res.status(200).json({
        success: true,
        postId: d.id,
        postUrl: d.link || `${wpUrl}/?p=${d.id}`,
        editUrl: `${wpUrl}/wp-admin/post.php?post=${d.id}&action=edit`,
        fields: {
          title: { sent: false, value: "—" },
          description: { sent: !!contentToSend, value: (contentToSend || "").slice(0, 40) },
          category: { sent: !!wpCategoryTermId, value: wpCategoryTermId || "—" },
          type: { sent: !!wpSubTermId, value: wpSubTermId || "—" },
          ville: { sent: !!extraTaxonomies["listivo_24530"], value: extraTaxonomies["listivo_24530"]?.[0] || "—" },
          quartier: { sent: !!extraTaxonomies["listivo_24531"], value: extraTaxonomies["listivo_24531"]?.[0] || "—" },
          prix: {
            sent: !!(mappedMeta["listivo_8983_listivo_13"] || mappedMeta["listivo_26005_listivo_13"]),
            value: mappedMeta["listivo_8983_listivo_13"] || mappedMeta["listivo_26005_listivo_13"] || "—"
          },
          adresse: { sent: !!mappedMeta["listivo_10522"], value: (mappedMeta["listivo_10522"] || "—").slice(0, 30) },
          
phone: {
  sent: !!mappedMeta[phoneKey],
  value: mappedMeta[phoneKey] || "—"
},

          image: { sent: uploadedMediaIds.length > 0, value: uploadedMediaIds.length ? uploadedMediaIds : "—" },
        },
        metaResults,
        uploadedMediaIds,
        cptSlug,
      });

    } catch (e) {
      return res.status(500).json({ success: false, error: e.message });
    }
  } catch (outerErr) {
    console.error("publish_listing outer error:", outerErr.message);
    return res.status(500).json({
      success: false,
      error: outerErr.message,
      stack: outerErr.stack?.slice(0, 300)
    });
  }
}


// ── Route: create_post (existing) ───────────────────────────────────────
if (action === "create_post") {

  const { title: rawTitle, content, excerpt, slug, imageUrl } = req.body;
  if (!rawTitle || !content) {
    return res.status(400).json({ error: "Missing title or content" });
  }
  // Remove leading emoji/symbols before first real character
  const title = rawTitle.replace(/^[\s\S]*?(?=[a-zA-Z\u00C0-\u024F\u0600-\u06FF])/, "").trim();

  try {
    // ── Step 1: Clean article — remove X-specific content ──────
    let clean = content;

    // Remove everything from CTA/hashtags onwards
    const ctaIndex = clean.search(/Découvrez sur|HASHTAGS:|FORMAT X:|Tweet \d\/3|\d\/3 —/);
    if (ctaIndex > 0) clean = clean.substring(0, ctaIndex);

    // Remove hashtags and mentions
    clean = clean.replace(/#[\w\u0600-\u06FF]+/gu, "");
    clean = clean.replace(/@\w+/g, "");

    // Remove disclaimer
    clean = clean.replace(/📌[^\n]*/g, "");

    // Remove lines that are just dashes
    clean = clean.replace(/^---+$/gm, "");

    // ── Remove ALL emojis — comprehensive single regex ────────
    clean = clean.replace(
      /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{1F1E0}-\u{1F1FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA9F}\u{1FAA0}-\u{1FAFF}\u{00A9}\u{00AE}\u{203C}\u{2049}\u{20E3}\u{2122}\u{2139}\u{2194}-\u{2199}\u{21A9}-\u{21AA}\u{231A}-\u{231B}\u{2328}\u{23CF}\u{23E9}-\u{23F3}\u{23F8}-\u{23FA}\u{24C2}\u{25AA}-\u{25AB}\u{25B6}\u{25C0}\u{25FB}-\u{25FE}\u{2600}-\u{2604}\u{260E}\u{2611}\u{2614}-\u{2615}\u{2618}\u{261D}\u{2620}\u{2622}-\u{2623}\u{2626}\u{262A}\u{262E}-\u{262F}\u{2638}-\u{263A}\u{2640}\u{2642}\u{2648}-\u{2653}\u{265F}-\u{2660}\u{2663}\u{2665}-\u{2666}\u{2668}\u{267B}\u{267E}-\u{267F}\u{2692}-\u{2697}\u{2699}\u{269B}-\u{269C}\u{26A0}-\u{26A1}\u{26A7}\u{26AA}-\u{26AB}\u{26B0}-\u{26B1}\u{26BD}-\u{26BE}\u{26C4}-\u{26C5}\u{26CE}-\u{26CF}\u{26D1}\u{26D3}-\u{26D4}\u{26E9}-\u{26EA}\u{26F0}-\u{26F5}\u{26F7}-\u{26FA}\u{26FD}\u{2702}\u{2705}\u{2708}-\u{270D}\u{270F}\u{2712}\u{2714}\u{2716}\u{271D}\u{2721}\u{2728}\u{2733}-\u{2734}\u{2744}\u{2747}\u{274C}\u{274E}\u{2753}-\u{2755}\u{2757}\u{2763}-\u{2764}\u{2795}-\u{2797}\u{27A1}\u{27B0}\u{27BF}\u{2934}-\u{2935}\u{2B05}-\u{2B07}\u{2B1B}-\u{2B1C}\u{2B50}\u{2B55}\u{3030}\u{303D}\u{3297}\u{3299}]/gu,
      ""
    );
    // Also remove variation selectors and zero-width joiners
    clean = clean.replace(/[\u{FE0F}\u{200D}\u{20E3}]/gu, "");

    // Clean up excess blank lines
    clean = clean.replace(/\n{3,}/g, "\n\n").trim();

    // CTA added as HTML directly after markdown conversion

    // ── Step 2: Convert Markdown to HTML ───────────────────────
    let html = clean;

    // Headers
    html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
    html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");

    // Bold
    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

    // Bullet points — collect into ul
    html = html.replace(/^[•\-\*] (.+)$/gm, "<li>$1</li>");
    html = html.replace(/(<li>[\s\S]+?<\/li>)/g, "<ul>$1</ul>");

    // Paragraphs — wrap non-tag lines
    const lines = html.split("\n");
    const processed = [];
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      if (t.startsWith("<h") || t.startsWith("<ul") || t.startsWith("<li")) {
        processed.push(t);
      } else {
        processed.push("<p>" + t + "</p>");
      }
    }
    html = processed.join("\n");

    // Add clean CTA with clickable link
    html = html + '\n<p><a href="https://travito.ma" target="_blank" rel="noopener">Découvrez toutes nos annonces sur travito.ma</a></p>';

    // ── Step 3: Upload featured image (if provided) ────────────
    const credentials = Buffer.from(wpUser + ":" + wpPassword).toString("base64");
    let featuredMediaId = null;
    if (imageUrl) {
      try {
        const imgRes = await fetch(imageUrl, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; Travito/1.0)", "Referer": "https://www.pexels.com" }
        });
        if (imgRes.ok) {
          const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
          const contentType = imgRes.headers.get("content-type") || "image/jpeg";
          const ext = contentType.includes("png") ? "png" : "jpg";
          const filename = "travito-" + Date.now() + "." + ext;
          const mediaRes = await fetch(wpUrl + "/wp-json/wp/v2/media", {
            method: "POST",
            headers: {
              "Authorization": "Basic " + credentials,
              "Content-Disposition": `attachment; filename="${filename}"`,
              "Content-Type": contentType,
            },
            body: imgBuffer,
          });
          const mediaData = await mediaRes.json();
          if (mediaData.id) {
            featuredMediaId = mediaData.id;
            console.log("WP media uploaded:", featuredMediaId);
          }
        }
      } catch(e) { console.log("WP image upload failed (non-blocking):", e.message); }
    }

    // ── Step 4: Post to WordPress REST API ─────────────────────

    console.log("WP POST to:", wpUrl + "/wp-json/wp/v2/posts");
    console.log("User:", wpUser, "| Category:", wpCategory);

    const response = await fetch(wpUrl + "/wp-json/wp/v2/posts", {
      method: "POST",
      headers: {
        "Authorization": "Basic " + credentials,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content: html,
        excerpt: excerpt || "",
        slug: slug || "",
        status: "publish",
        categories: [parseInt(wpCategory)],
        ...(featuredMediaId ? { featured_media: featuredMediaId } : {}),
        format: "standard",
        comment_status: "open",
        meta: {
          "_elementor_edit_mode": "builder",
          "_elementor_template_type": "wp-post",
          "_elementor_version": "3.0.0",
          "_wp_page_template": "default",
        },
      }),
    });

    const rawText = await response.text();
    console.log("WP status:", response.status);
    console.log("WP response:", rawText.substring(0, 400));

    let data;
    try {
      data = JSON.parse(rawText);
    } catch (e) {
      return res.status(500).json({
        success: false,
        error: "WordPress returned non-JSON (" + response.status + "): " + rawText.substring(0, 200),
      });
    }

    if (data.id) {
      return res.status(200).json({
        success: true,
        id: data.id,
        url: data.link,
        slug: data.slug,
        title: data.title && data.title.rendered ? data.title.rendered : title,
      });
    }

    return res.status(response.status).json({
      success: false,
      error: data.message || data.code || JSON.stringify(data).substring(0, 200),
    });

  } catch (error) {
    console.error("WP proxy error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}

}
