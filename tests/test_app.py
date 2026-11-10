import fakeredis
import pytest
import redis

from app import create_app, is_person, load_content

# The tests use their own small galaxy, so they keep passing whatever you put in content.json.
SOLO = {
    "owner": "Test Student",
    "headline": "Welcome to my student portfolio",
    "tagline": "Testing.",
    "planets": [
        {"slug": "ci-to-ghcr", "title": "CI Pipeline to GHCR", "summary": "CI", "tags": ["ci"], "size": "medium"},
        {"slug": "kind-lab", "title": "Kubernetes on kind", "summary": "k8s", "tags": ["kubernetes"], "size": "large"},
        {"slug": "redis-stack", "title": "Compose with Redis", "summary": "redis", "tags": ["redis"], "size": "huge"},
    ],
}

TEAM = {
    "owner": "Team Orbit",
    "headline": "Welcome to Team Orbit",
    "planets": [
        {"slug": "galaxy", "title": "This galaxy", "summary": "Our team project", "tags": ["kubernetes"]},
        {"slug": "maya", "title": "Maya Okafor", "summary": "Container engineer", "projects": [
            {"slug": "proxy", "title": "Proxy lab", "summary": "nginx", "tags": ["nginx"]},
            {"slug": "todo", "title": "To-do API", "summary": "flask", "tags": ["flask"]}]},
    ],
}


class DownRedis:
    """Stands in for Redis being stopped."""
    def incr(self, *a):
        raise redis.ConnectionError("down")
    mget = incr


def make(content, tmp_path, store=None):
    return create_app(content=content, redis_client=store or fakeredis.FakeRedis(decode_responses=True), web_dir=tmp_path).test_client()


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "test")
    return make(SOLO, tmp_path)


@pytest.fixture
def team(tmp_path):
    return make(TEAM, tmp_path)


# ---- your real content ----

def test_my_content_json_is_valid():
    """Checks the content.json and planets/*.json you actually ship."""
    c = load_content()
    slugs = [p["slug"] for p in c["planets"]]
    assert c["planets"], "add at least one planet to content.json or planets/"
    assert len(slugs) == len(set(slugs)), "two planets share a slug"
    for p in c["planets"]:
        assert p.get("slug") and p.get("title"), f"every planet needs a slug and a title: {p}"
        if is_person(p):
            moons = [m["slug"] for m in p["projects"]]
            assert len(moons) == len(set(moons)), f"two moons of {p['slug']} share a slug"


# ---- the app ----

def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200 and r.get_json()["status"] == "ok"


def test_welcome_page_shows_the_content(client):
    page = client.get("/welcome").get_data(as_text=True)
    assert "Welcome to my student portfolio" in page
    assert "Kubernetes on kind" in page


def test_environment_variable_changes_the_page(tmp_path, monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "kubernetes")
    monkeypatch.setenv("GALAXY_OWNER", "Ada")
    page = make(SOLO, tmp_path).get("/welcome").get_data(as_text=True)
    assert "kubernetes" in page and "I'm Ada" in page


def test_tag_filter(client):
    page = client.get("/welcome?tag=kubernetes").get_data(as_text=True)
    assert "Kubernetes on kind" in page and "Compose with Redis" not in page


def test_project_page_and_404(client):
    assert client.get("/p/ci-to-ghcr").status_code == 200
    assert client.get("/p/nope").status_code == 404


def test_api_lists_every_planet(client):
    g = client.get("/api/galaxy").get_json()
    assert [p["slug"] for p in g["planets"]] == ["ci-to-ghcr", "kind-lab", "redis-stack"]
    assert {"slug", "title", "size", "tags", "appearance", "views", "kind"} <= set(g["planets"][0])
    assert [p["size"] for p in g["planets"]] == ["medium", "large", "medium"]  # an unknown size becomes medium


def test_counter_counts_visits(client):
    client.get("/p/ci-to-ghcr")
    client.get("/p/ci-to-ghcr")
    client.get("/api/galaxy?visit=1")
    g = client.get("/api/galaxy").get_json()
    assert g["counter"] == "online" and g["views"] == 1
    assert next(p for p in g["planets"] if p["slug"] == "ci-to-ghcr")["views"] == 2


def test_pages_still_work_when_redis_is_down(tmp_path):
    c = make(SOLO, tmp_path, DownRedis())
    assert c.get("/health").status_code == 200
    assert "Redis is down" in c.get("/welcome").get_data(as_text=True)
    g = c.get("/api/galaxy").get_json()
    assert g["counter"] == "offline" and g["views"] is None


def test_api_projects_filter(client):
    assert [p["path"] for p in client.get("/api/projects?tag=redis").get_json()] == ["/p/redis-stack"]


def test_galaxy_page_without_a_build_points_to_welcome(client):
    assert "/welcome" in client.get("/").get_data(as_text=True)


# ---- team mode: a person is a planet, their projects are moons ----

def test_a_person_planet_has_a_landing_page_with_moons(team):
    page = team.get("/p/maya").get_data(as_text=True)
    assert "Maya Okafor" in page and "/p/maya/proxy" in page and "/p/maya/todo" in page


def test_a_moon_is_a_project_page_under_its_planet(team):
    assert "Moon of Maya Okafor" in team.get("/p/maya/todo").get_data(as_text=True)
    assert team.get("/p/maya/nope").status_code == 404
    assert team.get("/p/galaxy/anything").status_code == 404


def test_api_marks_people_and_their_moons(team):
    team.get("/p/maya/todo")
    g = team.get("/api/galaxy").get_json()
    assert {p["slug"]: p["kind"] for p in g["planets"]} == {"galaxy": "project", "maya": "person"}
    maya = next(p for p in g["planets"] if p["slug"] == "maya")
    assert [m["slug"] for m in maya["projects"]] == ["proxy", "todo"] and maya["projects"][1]["views"] == 1


def test_tag_filter_finds_a_person_by_a_moons_tag(team):
    page = team.get("/welcome?tag=nginx").get_data(as_text=True)
    assert "Maya Okafor" in page and "This galaxy" not in page


def test_each_teammate_can_have_their_own_file(tmp_path):
    (tmp_path / "planets").mkdir()
    (tmp_path / "content.json").write_text('{"owner": "Team", "planets": []}')
    (tmp_path / "planets" / "ben.json").write_text('{"slug": "ben", "title": "Ben", "order": 2, "projects": []}')
    (tmp_path / "planets" / "ada.json").write_text('{"slug": "ada", "title": "Ada", "order": 1, "projects": []}')
    assert [p["slug"] for p in load_content(tmp_path)["planets"]] == ["ada", "ben"]
