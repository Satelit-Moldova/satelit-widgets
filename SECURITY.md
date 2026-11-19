# Security

Please report vulnerabilities privately to **contact@satelit.md** with steps to reproduce. Do not open a public issue for them.

Scope: the widgets bundle and the three proxies in this repository. The proxies are built so that the API key never reaches a browser; a way to make one leak the key, call a route outside its allow-list, or inject markup through a widget is a vulnerability.

If your key was exposed, revoke it in the [console](https://developer.satelit.md/en/console/) and make a new one.
