"""A portfolio galaxy. The 3D page opens on the home planet (the welcome page); zoom out and every
planet in orbit is either one project, or one person whose moons are their projects.

Solo: every planet is a project. Team: every teammate is a planet with a landing page, and each
of their projects is a moon. Both kinds can sit in the same galaxy."""
import json
import os
import socket
from pathlib import Path

import redis
from flask import Flask, abort, jsonify, render_template, request, send_from_directory

HERE = Path(__file__).parent
SIZES = ("small", "medium", "large")


def load_content(folder=None):
    """content.json, plus one file per planet in planets/*.json. In a team, each person edits only
    their own planets/<name>.json, so nobody's commits collide."""
    folder = Path(folder or os.environ.get("CONTENT_DIR", HERE))
    with open(folder / "content.json", encoding="utf-8") as f:
        content = json.load(f)
    planets = list(content.get("planets", []))
    for extra in sorted((folder / "planets").glob("*.json")):
        with open(extra, encoding="utf-8") as f:
            planets.append(json.load(f))
    content["planets"] = sorted(planets, key=lambda p: p.get("order", 100))
    return content


def is_person(planet):
    """A planet with a projects list is a person; their projects are its moons."""
    return isinstance(planet.get("projects"), list)


def make_redis():
    # Compose and Kubernetes both name the service "redis", so the default works in both.
    return redis.Redis(
        host=os.environ.get("REDIS_HOST", "redis"),
        port=int(os.environ.get("REDIS_PORT", "6379")),
        socket_connect_timeout=0.5,
        socket_timeout=0.5,
        decode_responses=True,
    )


def create_app(content=None, redis_client=None, web_dir=None):
    app = Flask(__name__)
    content = content if content is not None else load_content()
    store = redis_client if redis_client is not None else make_redis()
    web = Path(web_dir or os.environ.get("WEB_DIR", HERE / "web" / "dist"))

    owner = os.environ.get("GALAXY_OWNER", content.get("owner", "Your Name"))
    s = {
        "owner": owner,
        "title": os.environ.get("GALAXY_TITLE", f"{owner}'s Galaxy"),
        "color": os.environ.get("GALAXY_COLOR", "#f2c56b"),
        "environment": os.environ.get("ENVIRONMENT", "local"),
        "version": os.environ.get("APP_VERSION", "dev"),
        # Kubernetes fills POD_NAME in from the pod's own name; anywhere else it's the hostname.
        "pod": os.environ.get("POD_NAME", socket.gethostname()),
    }

    planets = content.get("planets", [])
    for p in planets:
        if p.get("size") not in SIZES:
            p["size"] = "medium"
    by_slug = {p["slug"]: p for p in planets}
    # Every page that counts visits: the planets, and each person's moons as "<planet>/<project>".
    keys = [p["slug"] for p in planets] + [f'{p["slug"]}/{m["slug"]}' for p in planets if is_person(p) for m in p["projects"]]
    tags = sorted({t for p in planets for t in p.get("tags", [])} | {t for p in planets if is_person(p) for m in p["projects"] for t in m.get("tags", [])})

    def counter(*names, bump=None):
        """Read the view counters from Redis, adding one to `bump` first. None means Redis is down:
        the counter disappears, the pages still work."""
        try:
            if bump:
                store.incr(f"views:{bump}")
            return dict(zip(names, (int(v or 0) for v in store.mget([f"views:{k}" for k in names]))))
        except redis.RedisError:
            return None

    def planet_json(p, views):
        out = {k: p.get(k) for k in ("slug", "title", "summary", "tags", "size", "appearance")}
        out["kind"] = "person" if is_person(p) else "project"
        out["views"] = views.get(p["slug"]) if views else None
        if is_person(p):
            out["projects"] = [
                {**{k: m.get(k) for k in ("slug", "title", "summary", "tags")},
                 "views": views.get(f'{p["slug"]}/{m["slug"]}') if views else None}
                for m in p["projects"]
            ]
        return out

    def matches(p, tag):
        return not tag or tag in p.get("tags", []) or any(tag in m.get("tags", []) for m in p.get("projects") or [])

    @app.get("/")
    def galaxy_page():
        # The 3D galaxy, built by Vite into web/dist during the image build.
        if not (web / "index.html").exists():
            return render_template("no_web.html", s=s), 200
        return send_from_directory(web, "index.html")

    @app.get("/assets/<path:name>")
    def assets(name):
        return send_from_directory(web / "assets", name, max_age=31536000)

    @app.get("/planet-view.js")
    def planet_view():
        if not (web / "planet-view.js").exists():
            return "", 204
        return send_from_directory(web, "planet-view.js")

    @app.get("/welcome")
    def welcome():
        tag = request.args.get("tag")
        shown = [p for p in planets if matches(p, tag)]
        views = counter("home", bump="home")
        return render_template("welcome.html", s=s, c=content, planets=shown, tags=tags, tag=tag, views=views, is_person=is_person,
                               team=any(is_person(p) for p in planets))

    @app.get("/p/<slug>")
    def planet(slug):
        p = by_slug.get(slug)
        if p is None:
            abort(404)
        views = counter(slug, bump=slug)
        if is_person(p):
            return render_template("person.html", s=s, c=content, p=p, views=views)
        return render_template("project.html", s=s, c=content, p=p, parent=None, key=slug, views=views)

    @app.get("/p/<slug>/<project>")
    def moon(slug, project):
        p = by_slug.get(slug)
        m = next((m for m in (p or {}).get("projects") or [] if m["slug"] == project), None)
        if m is None:
            abort(404)
        key = f"{slug}/{project}"
        views = counter(key, bump=key)
        return render_template("project.html", s=s, c=content, p=m, parent=p, key=key, views=views)

    @app.get("/api/galaxy")
    def api_galaxy():
        views = counter("home", "galaxy", *keys, bump="galaxy" if request.args.get("visit") else None)
        return jsonify(
            owner=s["owner"],
            title=s["title"],
            color=s["color"],
            environment=s["environment"],
            version=s["version"],
            pod=s["pod"],
            headline=content.get("headline", "Welcome to my student portfolio"),
            tagline=content.get("tagline", ""),
            home={"appearance": content.get("home", {}).get("appearance", {})},
            counter="online" if views is not None else "offline",
            views=views["galaxy"] if views else None,
            planets=[planet_json(p, views) for p in planets],
        )

    @app.get("/api/projects")
    def api_projects():
        """Every project in the galaxy, flat: project planets and every person's moons."""
        tag = request.args.get("tag")
        views = counter(*keys) or {}
        out = []
        for p in planets:
            items = [(f'{p["slug"]}/{m["slug"]}', m, p) for m in p["projects"]] if is_person(p) else [(p["slug"], p, None)]
            for key, m, parent in items:
                if not tag or tag in m.get("tags", []):
                    out.append({"path": f"/p/{key}", "title": m["title"], "owner": parent["title"] if parent else s["owner"],
                                "tags": m.get("tags", []), "views": views.get(key)})
        return jsonify(out)

    @app.get("/health")
    def health():
        # Only says the app itself is up. Redis being down doesn't make the galaxy unhealthy.
        return jsonify(status="ok", version=s["version"])

    return app


if __name__ == "__main__":
    create_app().run(host="0.0.0.0", port=int(os.environ.get("PORT", "8000")), debug=True)
else:
    app = create_app()
