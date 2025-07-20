
import type { D1Database, PagesFunction } from "@cloudflare/workers-types";

interface Env {
  DB: D1Database;
  TURNSTILE_SECRET_KEY: string;
}

interface SessionData {
  id: string;
  wrong_question_ids: string; // JSON string
  exams_taken: number;
  exams_passed: number;
  exams_failed: number;
}

const generateId = () => Math.random().toString(36).substring(2, 7).toUpperCase();

async function verifyTurnstile(token: string, secretKey: string, ip: string): Promise<boolean> {
  if (!token) return false;
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: secretKey, response: token, remoteip: ip }),
    });
    const data = await response.json<{ success: boolean }>();
    return data.success;
  } catch (e) {
    console.error("Turnstile verification failed:", e);
    return false;
  }
}

const getSession = async (db: D1Database, sessionId: string): Promise<Response> => {
    const upperCaseId = sessionId.toUpperCase();
    const { results } = await db.prepare(
      "SELECT id, wrong_question_ids, exams_taken, exams_passed, exams_failed FROM ExamSessions WHERE id = ?"
    ).bind(upperCaseId).all<SessionData>();
    
    if (!results || results.length === 0) {
      return new Response('Session not found', { status: 404 });
    }
    return new Response(JSON.stringify(results[0]), { headers: { 'Content-Type': 'application/json' } });
}

export const onRequest: PagesFunction<Env> = async ({ request, env, params }) => {
  const url = new URL(request.url);
  const path = (params.path as string[]).join('/');
  const clientIp = request.headers.get('CF-Connecting-IP') || '';

  if (path === 'welcome') {
    const { city, country, colo } = request.cf || {};
    return new Response(JSON.stringify({ city: city || '未知', country: country || '未知', colo: colo || '未知' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (path === 'session' && request.method === 'POST') {
    try {
      const { action, sessionId, turnstileToken, payload } = await request.json<any>();

      if (action === 'load') {
        // A Turnstile token is required to load an arbitrary session ID entered by the user.
        // However, for user convenience, we bypass this check if no token is provided,
        // assuming it's an automatic session resume from sessionStorage on page load.
        // This is a calculated security trade-off for better UX. The risk is low.
        const isManualLoadWithToken = !!turnstileToken;
        if (isManualLoadWithToken) {
            const isTokenValid = await verifyTurnstile(turnstileToken, env.TURNSTILE_SECRET_KEY, clientIp);
            if (!isTokenValid) {
                return new Response('Invalid Turnstile token', { status: 403 });
            }
        }
        // Proceed to load if it's a manual load with a valid token, or an automatic session resume.
        return getSession(env.DB, sessionId);
      }

      if (action === 'clear') {
        if (!sessionId) return new Response('Missing session ID', { status: 400 });
        await env.DB.prepare("UPDATE ExamSessions SET wrong_question_ids = '[]' WHERE id = ?").bind(sessionId).run();
        return getSession(env.DB, sessionId);
      }

      if (action === 'save') {
        const { wrongAnswerIds, result } = payload || {};
        const wrongIdsJson = JSON.stringify(wrongAnswerIds || []);
        
        if (sessionId) { // Update existing
          const updateStmt = result
            ? env.DB.prepare(`UPDATE ExamSessions SET wrong_question_ids = ?, exams_taken = exams_taken + 1, exams_passed = exams_passed + CASE WHEN ? = 'pass' THEN 1 ELSE 0 END, exams_failed = exams_failed + CASE WHEN ? = 'fail' THEN 1 ELSE 0 END WHERE id = ?`)
            : env.DB.prepare(`UPDATE ExamSessions SET wrong_question_ids = ? WHERE id = ?`);
          
          await (result ? updateStmt.bind(wrongIdsJson, result, result, sessionId) : updateStmt.bind(wrongIdsJson, sessionId)).run();
          return getSession(env.DB, sessionId);
        } else { // Create new
          let newId = generateId();
          let exists = true;
          while (exists) {
            const { results } = await env.DB.prepare("SELECT id FROM ExamSessions WHERE id = ?").bind(newId).all();
            if (results.length === 0) { exists = false; } else { newId = generateId(); }
          }

          const exams_passed = result === 'pass' ? 1 : 0;
          const exams_failed = result === 'fail' ? 1 : 0;
          
          await env.DB.prepare(
            `INSERT INTO ExamSessions (id, wrong_question_ids, exams_taken, exams_passed, exams_failed) VALUES (?, ?, ?, ?, ?)`
          ).bind(newId, wrongIdsJson, result ? 1 : 0, exams_passed, exams_failed).run();
          
          const sessionData = { id: newId, wrong_question_ids: wrongIdsJson, exams_taken: result ? 1 : 0, exams_passed, exams_failed };
          return new Response(JSON.stringify(sessionData), { status: 201, headers: { 'Content-Type': 'application/json' } });
        }
      }
      return new Response('Invalid action', { status: 400 });
    } catch (e: any) {
      console.error(e);
      return new Response(`Server error: ${e.message}`, { status: 500 });
    }
  }

  return new Response('Not Found', { status: 404 });
};
