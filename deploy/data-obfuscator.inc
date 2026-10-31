# /etc/httpd/conf.d/data-obfuscator.inc      (CentOS / RHEL 9, Apache httpd 2.4)
#
# Publishes the app at  https://hyperpkpd.com/data-obfuscator/  inside the EXISTING site.
# It is an include file, not a virtual host: the name ends in .inc on purpose, so Apache does not
# load it by itself. Add this ONE line inside the existing  <VirtualHost *:443>  block of
# hyperpkpd.com, ABOVE any PHP, RewriteRule or ProxyPassMatch lines, then reload Apache:
#
#     Include /etc/httpd/conf.d/data-obfuscator.inc
#
# Needs the modules proxy, proxy_http, headers and setenvif (loaded by default on CentOS 9).
# Check:  httpd -M | grep -E 'proxy_http|headers|setenvif'
#
# The Node server runs at 127.0.0.1:8787 and never sees the /data-obfuscator prefix: Apache removes
# it. Nothing else on the site is affected; PHP keeps serving everything outside /data-obfuscator/.

# The address must end in a slash for the page to find its files. /data-obfuscator -> /data-obfuscator/
RedirectMatch 301 "^/data-obfuscator$" "/data-obfuscator/"

# Hand everything under /data-obfuscator/ to the Node server (page, API and live log).
ProxyPass        "/data-obfuscator/" "http://127.0.0.1:8787/" timeout=300
ProxyPassReverse "/data-obfuscator/" "http://127.0.0.1:8787/"

<Location "/data-obfuscator/">
    # Uploads: keep this a little above MAX_UPLOAD_MB. This is Apache's limit, not PHP's:
    # upload_max_filesize and post_max_size do not apply to this path.
    LimitRequestBody 57671680

    # Lets the app see the real visitor address for its rate limit (with TRUST_PROXY=1 in .env).
    RequestHeader set X-Forwarded-Proto "https"

    # Optional: password-protect the app until you have real sign-in.
    #   sudo htpasswd -c /etc/httpd/.htpasswd alice
    # AuthType Basic
    # AuthName "Data Obfuscator"
    # AuthUserFile /etc/httpd/.htpasswd
    # Require valid-user
</Location>

# Live progress (Server-Sent Events) must not be compressed or held back, or the log appears all
# at once at the end.
SetEnvIf Request_URI "^/data-obfuscator/api/jobs/[0-9a-f-]+/events$" no-gzip dont-vary
