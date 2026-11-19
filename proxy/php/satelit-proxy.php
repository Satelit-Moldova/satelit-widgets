<?php
/**
 * Satelit widgets proxy: one file for shared hosting (PHP 7.4+).
 *
 * Upload it next to your site (e.g. /satelit-proxy.php), set the key below or in the
 * SATELIT_API_KEY environment variable, and point the widgets at it:
 *   <script src="satelit-widgets.js" data-proxy="/satelit-proxy.php"></script>
 * Widgets call /satelit-proxy.php/rates?lang=ro (or ?path=/rates&lang=ro where PATH_INFO is off).
 *
 * It lets through only the widgets' GET routes, caches answers in files and adds CORS.
 * MIT License, Copyright (c) 2026 Satelit (satelit.md).
 */

// ---- Settings ----------------------------------------------------------------
// Better: keep the key out of the web root, in an environment variable or a file
// one level above (see SATELIT_KEY_FILE). Never commit it.
const SATELIT_API_KEY = '';
const SATELIT_KEY_FILE = __DIR__ . '/../satelit-key.txt';
// Sites allowed to call the proxy from the browser: ['https://example.md'] or ['*'].
const SATELIT_ALLOWED_ORIGINS = ['*'];
// Cache folder (writable by PHP). Defaults to the system temp folder.
const SATELIT_CACHE_DIR = '';
// Upstream calls allowed per minute for the whole site (cache misses only).
const SATELIT_UPSTREAM_PER_MIN = 120;
// ------------------------------------------------------------------------------

const SATELIT_API = 'https://api.satelit.md/v1';
const SATELIT_NEGATIVE_TTL = 300;
const SATELIT_STALE_IF_ERROR = 86400;

function satelit_routes()
{
    $lang = function ($v) { return in_array($v, ['ro', 'ru', 'en', 'uk'], true); };
    $key = function ($v) { return (bool) preg_match('/^[a-z0-9_-]{1,40}$/i', $v); };
    $text = function ($min, $max) {
        return function ($v) use ($min, $max) {
            $len = function_exists('mb_strlen') ? 'mb_strlen' : 'strlen';
            return $len(trim($v)) >= $min && $len($v) <= $max;
        };
    };
    $int = function ($min, $max) {
        return function ($v) use ($min, $max) { return preg_match('/^\d{1,4}$/', $v) && (int) $v >= $min && (int) $v <= $max; };
    };
    $date = function ($v) { return (bool) preg_match('/^\d{4}-\d{2}-\d{2}$/', $v); };
    $bool = function ($v) { return $v === 'true' || $v === 'false'; };
    $country = function ($v) { return (bool) preg_match('/^[A-Z]{2}$/', $v); };
    // Same list and TTLs as proxy/node/policy.mjs.
    return [
        ['name' => 'rates', 'path' => '#^/rates$#', 'ttl' => 10800, 'params' => ['lang' => $lang]],
        ['name' => 'fuel', 'path' => '#^/fuel$#', 'ttl' => 7200, 'params' => ['lang' => $lang]],
        ['name' => 'news', 'path' => '#^/news$#', 'ttl' => 600, 'params' => ['lang' => $lang, 'per' => $int(1, 20), 'category' => $key, 'region' => $key]],
        ['name' => 'prices-search', 'path' => '#^/prices/search$#', 'ttl' => 10800, 'required' => ['q'],
            'params' => ['lang' => $lang, 'q' => $text(2, 100), 'store' => $key, 'category' => $key, 'in_stock' => $bool]],
        ['name' => 'prices-item', 'path' => '#^/prices/items/\d{1,9}$#', 'ttl' => 10800, 'params' => ['lang' => $lang]],
        ['name' => 'cinema-today', 'path' => '#^/movies/cinemas/today$#', 'ttl' => 7200,
            'params' => ['lang' => $lang, 'country' => $country, 'city' => $text(1, 60), 'date' => $date]],
    ];
}

/** Returns ['ok' => true, 'route' => …, 'upstream' => '/rates?lang=ro'] or ['ok' => false, 'status', 'code', 'message']. */
function satelit_resolve($path, array $query)
{
    $path = rtrim($path, '/');
    if (strpos($path, '/v1/') === 0) {
        $path = substr($path, 3);
    }
    foreach (satelit_routes() as $route) {
        if (!preg_match($route['path'], $path)) {
            continue;
        }
        $kept = [];
        foreach ($query as $k => $v) {
            if (!isset($route['params'][$k]) || !is_string($v)) {
                continue;
            }
            if (!$route['params'][$k]($v)) {
                return ['ok' => false, 'status' => 422, 'code' => 'invalid', 'message' => 'Bad value for "' . $k . '".'];
            }
            $kept[$k] = ($k === 'q' || $k === 'city') ? trim($v) : $v;
        }
        foreach ($route['required'] ?? [] as $req) {
            if (!isset($kept[$req])) {
                return ['ok' => false, 'status' => 422, 'code' => 'invalid', 'message' => '"' . $req . '" is required.'];
            }
        }
        ksort($kept);
        $qs = http_build_query($kept, '', '&', PHP_QUERY_RFC3986);
        return ['ok' => true, 'route' => $route, 'upstream' => $path . ($qs !== '' ? '?' . $qs : '')];
    }
    return ['ok' => false, 'status' => 404, 'code' => 'not_allowed', 'message' => 'This route is not served by the proxy.'];
}

function satelit_key()
{
    if (SATELIT_API_KEY !== '') {
        return SATELIT_API_KEY;
    }
    $env = getenv('SATELIT_API_KEY');
    if ($env) {
        return $env;
    }
    if (is_readable(SATELIT_KEY_FILE)) {
        return trim((string) file_get_contents(SATELIT_KEY_FILE));
    }
    return '';
}

function satelit_cache_dir()
{
    $dir = SATELIT_CACHE_DIR !== '' ? SATELIT_CACHE_DIR : sys_get_temp_dir() . '/satelit-proxy-cache';
    if (!is_dir($dir)) {
        @mkdir($dir, 0700, true);
    }
    return $dir;
}

function satelit_cache_read($file)
{
    if (!is_readable($file)) {
        return null;
    }
    $e = json_decode((string) @file_get_contents($file), true);
    return is_array($e) && isset($e['body'], $e['status'], $e['stored'], $e['ttl']) ? $e : null;
}

function satelit_cache_write($file, array $e)
{
    $tmp = $file . '.' . getmypid() . '.tmp';
    if (@file_put_contents($tmp, json_encode($e), LOCK_EX) !== false) {
        @rename($tmp, $file);
    }
}

/** Counts upstream calls per minute in one small file; false once the cap is reached. */
function satelit_take_upstream_slot($dir)
{
    $f = @fopen($dir . '/_minute', 'c+');
    if (!$f) {
        return true;
    }
    flock($f, LOCK_EX);
    $raw = stream_get_contents($f);
    $minute = (int) floor(time() / 60);
    $parts = explode(' ', trim((string) $raw));
    $count = (count($parts) === 2 && (int) $parts[0] === $minute) ? (int) $parts[1] : 0;
    $ok = $count < SATELIT_UPSTREAM_PER_MIN;
    if ($ok) {
        ftruncate($f, 0);
        rewind($f);
        fwrite($f, $minute . ' ' . ($count + 1));
    }
    flock($f, LOCK_UN);
    fclose($f);
    return $ok;
}

/** GET with a 10 s timeout. Returns [status, body] or null on a network failure. */
function satelit_http_get($url, $key)
{
    $headers = ['Authorization: Bearer ' . $key, 'Accept: application/json', 'User-Agent: satelit-widgets-php/1.0'];
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true, CURLOPT_HTTPHEADER => $headers,
            CURLOPT_CONNECTTIMEOUT => 5, CURLOPT_TIMEOUT => 10, CURLOPT_FOLLOWLOCATION => false,
        ]);
        $body = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);
        return $body === false ? null : [$status, $body];
    }
    $ctx = stream_context_create(['http' => ['method' => 'GET', 'header' => implode("\r\n", $headers), 'timeout' => 10, 'ignore_errors' => true]]);
    $body = @file_get_contents($url, false, $ctx);
    if ($body === false || !isset($http_response_header[0])) {
        return null;
    }
    preg_match('#\s(\d{3})\s#', $http_response_header[0] . ' ', $m);
    return [(int) ($m[1] ?? 0), $body];
}

function satelit_send($status, $body, array $headers)
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    foreach ($headers as $k => $v) {
        header($k . ': ' . $v);
    }
    echo $body;
}

function satelit_error($status, $code, $message, array $headers)
{
    satelit_send($status, json_encode(['error' => ['code' => $code, 'message' => $message]]), $headers);
}

function satelit_main()
{
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    $allowAll = in_array('*', SATELIT_ALLOWED_ORIGINS, true);
    $allowed = $origin === '' || $allowAll || in_array(rtrim($origin, '/'), SATELIT_ALLOWED_ORIGINS, true);
    $cors = ['Vary' => 'Origin'];
    if ($origin !== '' && $allowed) {
        $cors['Access-Control-Allow-Origin'] = $allowAll ? '*' : $origin;
        $cors['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
        $cors['Access-Control-Max-Age'] = '86400';
    }
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if ($method === 'OPTIONS') {
        http_response_code(204);
        foreach ($cors as $k => $v) {
            header($k . ': ' . $v);
        }
        return;
    }
    if ($method !== 'GET') {
        satelit_error(405, 'method_not_allowed', 'GET only.', $cors + ['Allow' => 'GET, OPTIONS']);
        return;
    }
    if (!$allowed) {
        satelit_error(403, 'origin_not_allowed', 'This origin is not allowed.', $cors);
        return;
    }
    $query = $_GET;
    $path = $_SERVER['PATH_INFO'] ?? '';
    if ($path === '' && isset($query['path']) && is_string($query['path'])) {
        $path = $query['path'];
    }
    unset($query['path']);
    $r = satelit_resolve($path, $query);
    if (!$r['ok']) {
        satelit_error($r['status'], $r['code'], $r['message'], $cors);
        return;
    }
    $key = satelit_key();
    if ($key === '') {
        satelit_error(503, 'not_configured', 'The proxy has no API key.', $cors);
        return;
    }

    $dir = satelit_cache_dir();
    $file = $dir . '/' . sha1($r['upstream']) . '.json';
    $hit = satelit_cache_read($file);
    $now = time();
    $age = $hit ? $now - $hit['stored'] : PHP_INT_MAX;
    $out = function (array $e, $state) use ($cors, $now) {
        $left = max(0, $e['ttl'] - ($now - $e['stored']));
        $maxAge = $state === 'STALE' ? 60 : min($left, 300);
        satelit_send($e['status'], $e['body'], $cors + ['Cache-Control' => 'public, max-age=' . $maxAge, 'X-Cache' => $state]);
    };
    if ($hit && $age < $hit['ttl']) {
        $out($hit, 'HIT');
        return;
    }
    $staleOk = $hit && $age < $hit['ttl'] + SATELIT_STALE_IF_ERROR;
    if (!satelit_take_upstream_slot($dir)) {
        if ($staleOk) {
            $out($hit, 'STALE');
        } else {
            satelit_error(429, 'rate_limited', 'Too many uncached requests, try again in a minute.', $cors + ['Retry-After' => '60']);
        }
        return;
    }
    $res = satelit_http_get(SATELIT_API . $r['upstream'], $key);
    if ($res === null || json_decode($res[1]) === null || $res[0] >= 429) {
        error_log('satelit-proxy: ' . $r['route']['name'] . ' failed: ' . ($res === null ? 'network' : 'status ' . $res[0]));
        if ($staleOk) {
            $out($hit, 'STALE');
        } elseif ($res !== null && json_decode($res[1]) !== null) {
            satelit_send($res[0], $res[1], $cors);
        } else {
            satelit_error(502, 'upstream_unavailable', 'The data API is not reachable right now.', $cors);
        }
        return;
    }
    $e = ['status' => $res[0], 'body' => $res[1], 'stored' => $now, 'ttl' => $res[0] === 200 ? $r['route']['ttl'] : SATELIT_NEGATIVE_TTL];
    if (in_array($res[0], [200, 404, 422], true)) {
        satelit_cache_write($file, $e);
    } else {
        error_log('satelit-proxy: ' . $r['route']['name'] . ' answered ' . $res[0]);
        $e['ttl'] = 0;
    }
    $out($e, 'MISS');
}

// Allows tests to include the file for its functions without serving a request.
if (!defined('SATELIT_PROXY_NO_MAIN')) {
    satelit_main();
}
