<?php
declare(strict_types=1);

const INBOX = 'info@arkron.net';
const SUCCESS = 'Solicitud enviada. El equipo de Arkron se pondrá en contacto contigo.';
const UNAVAILABLE = 'No pudimos enviar la solicitud. Escríbenos por WhatsApp o a ' . INBOX . '.';

function respond(int $status, string $message): void
{
    http_response_code($status);
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    if (str_contains($_SERVER['HTTP_ACCEPT'] ?? '', 'application/json')) {
        header('Content-Type: application/json; charset=UTF-8');
        echo json_encode(['ok' => $status === 200, 'message' => $message], JSON_UNESCAPED_UNICODE);
    } else {
        header('Content-Type: text/html; charset=UTF-8');
        $safe = htmlspecialchars($message, ENT_QUOTES, 'UTF-8');
        echo '<!doctype html><html lang="es-EC"><meta charset="utf-8">'
            . '<meta name="viewport" content="width=device-width,initial-scale=1">'
            . '<title>Solicitud de cotización | Arkron</title><link rel="stylesheet" href="/assets/site.css">'
            . '<main class="shell section"><h1>Solicitud de cotización</h1><p class="lede">' . $safe . '</p>'
            . '<p><a class="text-link" href="/contacto/#solicitud">Volver a Contacto</a></p></main></html>';
    }
    exit;
}

function readField(string $key, string $label, int $limit, bool $required = true): string
{
    $raw = $_POST[$key] ?? '';
    if (!is_string($raw)) {
        respond(422, "Revisa el campo $label.");
    }
    $value = trim($raw);
    $length = preg_match_all('/./us', $value);
    if ($length === false || $length > $limit || ($required && $length === 0)) {
        respond(422, "Revisa el campo $label.");
    }
    if ($key !== 'detalle' && strpbrk($value, "\r\n") !== false) {
        respond(422, "Revisa el campo $label.");
    }
    return $value;
}

function claimAttempt(): void
{
    // One locked file per installation. Store short-lived hashes of addresses.
    $file = sys_get_temp_dir() . '/arkron-quote-' . hash('sha256', __DIR__) . '.json';
    $handle = @fopen($file, 'c+');
    if ($handle === false) {
        error_log('Arkron quote form could not open its rate-limit file.');
        respond(503, UNAVAILABLE);
    }
    @chmod($file, 0600);
    if (!flock($handle, LOCK_EX)) {
        fclose($handle);
        respond(503, UNAVAILABLE);
    }

    $stored = json_decode(stream_get_contents($handle) ?: '{}', true);
    $now = time();
    $stale = $now - 900;
    $active = [];
    foreach (is_array($stored) ? $stored : [] as $address => $attempts) {
        $recent = array_values(array_filter($attempts, static fn($time) => $time > $stale));
        if ($recent) {
            $active[$address] = $recent;
        }
    }
    $key = hash('sha256', $file . ($_SERVER['REMOTE_ADDR'] ?? 'unknown'));
    if (count($active[$key] ?? []) >= 5) {
        fclose($handle);
        header('Retry-After: 900');
        respond(429, 'Se alcanzó el límite de envíos. Espera unos minutos o contáctanos por WhatsApp.');
    }
    $active[$key][] = $now;
    rewind($handle);
    $data = json_encode($active, JSON_THROW_ON_ERROR);
    $saved = ftruncate($handle, 0) && fwrite($handle, $data) === strlen($data) && fflush($handle);
    fclose($handle);
    if (!$saved) {
        respond(503, UNAVAILABLE);
    }
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    respond(405, 'Usa el formulario de contacto de Arkron para enviar tu solicitud.');
}
if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 64000) {
    respond(413, 'El detalle de la solicitud es demasiado extenso.');
}
if (!str_starts_with($_SERVER['CONTENT_TYPE'] ?? '', 'application/x-www-form-urlencoded')) {
    respond(415, 'Usa el formulario de contacto de Arkron para enviar tu solicitud.');
}
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$host = parse_url('https://' . ($_SERVER['HTTP_HOST'] ?? ''), PHP_URL_HOST);
if (($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '') === 'cross-site'
    || ($origin !== '' && strcasecmp((string) parse_url($origin, PHP_URL_HOST), (string) $host) !== 0)) {
    respond(403, 'Abre el formulario desde la web de Arkron.');
}
if (($_POST['sitio_web'] ?? '') !== '') {
    respond(200, SUCCESS);
}

$name = readField('nombre', 'Nombre', 120);
$company = readField('empresa', 'Empresa', 150);
$replyTo = readField('correo', 'Correo', 180);
$phone = readField('telefono', 'Teléfono', 45, false);
$service = readField('servicio', 'Solución o servicio', 240);
$brand = readField('fabricante', 'Fabricante', 100, false);
$details = readField('detalle', 'Detalle del requerimiento', 3500);
if (filter_var($replyTo, FILTER_VALIDATE_EMAIL) === false) {
    respond(422, 'Introduce un correo electrónico válido.');
}
claimAttempt();

$lines = [
    'Solicitud de cotización recibida desde la web de Arkron',
    '',
    "Nombre: $name",
    "Empresa: $company",
    "Correo: $replyTo",
    "Teléfono: $phone",
    "Solución o servicio: $service",
];
if ($brand !== '') {
    $lines[] = "Fabricante: $brand";
}
$lines[] = '';
$lines[] = 'Detalle del requerimiento';
// Quoted-printable preserves UTF-8 and keeps long descriptions within SMTP line limits.
$lines[] = $details;
$body = quoted_printable_encode(implode("\r\n", $lines));
$headers = [
    'From' => 'Arkron <' . INBOX . '>',
    'Reply-To' => $replyTo,
    'MIME-Version' => '1.0',
    'Content-Type' => 'text/plain; charset=UTF-8',
    'Content-Transfer-Encoding' => 'quoted-printable',
];
try {
    $sent = @mail(INBOX, 'Solicitud de cotizacion | Arkron', $body, $headers);
} catch (Throwable) {
    $sent = false;
}
if (!$sent) {
    error_log('Arkron quote form mail transport did not accept the message.');
    respond(503, UNAVAILABLE);
}
respond(200, SUCCESS);
