#!/usr/bin/env bash
# End-to-end API test against the real MySQL-backed server:
# two users, CSRF, CRUD, validation, isolation (404 for other users' ids), cascade delete checked in the real tables.
#
# Usage (Git Bash, from anywhere; the app must be running, e.g. docker compose up --build):
#   bash demo/scripts/api_2c.sh                      # default http://localhost:8080
#   BASE_URL=http://localhost:9090 bash demo/scripts/api_2c.sh
# Needs: curl, and "docker compose" for the SQL checks (reads the DB login from the db container's own
# environment; no password is stored in or printed by this script).
# Expects APP_SAMPLE_DATA=true (new accounts get 5 sample courses and 13 tasks).
# Creates throwaway accounts with a test-only password. Exit code 1 if any check fails.
B="${BASE_URL:-http://localhost:8080}"
PROJECT="$(cd "$(dirname "$0")/../.." && pwd)"   # project root (where docker-compose.yml is)
JARS="$(mktemp -d)"; trap 'rm -rf "$JARS"' EXIT   # cookie jars hold session ids: keep them out of the project
JA="$JARS/a-cookies.txt"; JB="$JARS/b-cookies.txt"
PASS=0; FAILN=0
tok() { awk '$6=="XSRF-TOKEN"{print $7}' "$1" | tail -1; }

# req JAR METHOD PATH [JSON]  -> sets CODE and BODY
req() {
  local jar="$1" m="$2" p="$3" data="$4"
  local args=(-s -b "$jar" -c "$jar" -X "$m" -w '\n%{http_code}')
  [ "$m" != GET ] && args+=(-H "X-XSRF-TOKEN: $(tok "$jar")")
  [ -n "$data" ] && args+=(-H 'Content-Type: application/json' -d "$data")
  local out; out=$(curl "${args[@]}" "$B$p")
  CODE="${out##*$'\n'}"; BODY="${out%$'\n'*}"
}
# check LABEL EXPECTED_CODE [GREP_IN_BODY]
check() {
  local ok=1
  [ "$CODE" = "$2" ] || ok=0
  [ -n "$3" ] && ! grep -qF -- "$3" <<<"$BODY" && ok=0
  if [ $ok = 1 ]; then PASS=$((PASS+1)); printf "  PASS %-58s %s\n" "$1" "$CODE"
  else FAILN=$((FAILN+1)); printf "  FAIL %-58s got %s, want %s %s\n       body: %s\n" "$1" "$CODE" "$2" "$3" "$BODY"; fi
}
jid() { sed -E 's/^\{"id":([0-9]+).*/\1/' <<<"$BODY"; }
sql() { (cd "$PROJECT" && docker compose exec -T db sh -c "mysql -N -u\"\$MYSQL_USER\" -p\"\$MYSQL_PASSWORD\" -D\"\$MYSQL_DATABASE\" -e \"$1\"" 2>/dev/null); }
SCALE() { echo "[{\"letter\":\"A\",\"minPercent\":$1},{\"letter\":\"B+\",\"minPercent\":$2},{\"letter\":\"B\",\"minPercent\":$3},{\"letter\":\"C+\",\"minPercent\":65},{\"letter\":\"C\",\"minPercent\":60},{\"letter\":\"D+\",\"minPercent\":55},{\"letter\":\"D\",\"minPercent\":$4},{\"letter\":\"F\",\"minPercent\":0}]"; }

T=$(date +%s)
curl -s -c "$JA" -o /dev/null $B/login.html; curl -s -c "$JB" -o /dev/null $B/login.html
req "$JA" POST /api/auth/register "{\"name\":\"User A\",\"email\":\"a-$T@uni.edu\",\"password\":\"password1\"}"; check "register user A" 201
req "$JB" POST /api/auth/register "{\"name\":\"User B\",\"email\":\"b-$T@uni.edu\",\"password\":\"password1\"}"; check "register user B" 201

echo "== Courses (user A)"
req "$JA" GET /api/courses; check "GET /api/courses (5 sample courses, CS201 A=85)" 200 '"code":"CS201"'
req "$JA" POST /api/courses '{"code":"web101","name":"Web Programming","instructor":"Dr. Lee","credits":3}'; check "POST course -> code upper-cased, default scale" 201 '"code":"WEB101"'; CA=$(jid)
req "$JA" POST /api/courses '{"code":"WEB101","name":"Again","credits":3}'; check "POST duplicate code" 400 '"code":"You already have a course with this code."'
req "$JA" POST /api/courses '{"code":"","name":"","credits":7}'; check "POST empty code/name, credits 7" 400 '"credits":"Credits must be 1–6."'
req "$JA" PUT /api/courses/$CA '{"code":"WEB101","name":"Web Programming II","instructor":"","credits":4}'; check "PUT course" 200 '"name":"Web Programming II"'

echo "== Grade scale (user A)"
req "$JA" PUT /api/courses/$CA/grade-scale "$(SCALE 85 75 70 50)"; check "PUT valid scale (A=85)" 200 '{"letter":"A","minPercent":85.0}'
echo "     DB course_grade_scale A for course $CA: $(sql "SELECT min_percent FROM course_grade_scale WHERE course_id=$CA AND letter='A'")"
req "$JA" PUT /api/courses/$CA/grade-scale "$(SCALE 80 90 70 50)"; check "scale B+ (90) above A (80)" 400 '"B+":"Must be lower than A."'
req "$JA" PUT /api/courses/$CA/grade-scale "$(SCALE 80 75 75 50)"; check "scale duplicate (B = B+ = 75)" 400 '"B":"Must be lower than B+."'
req "$JA" PUT /api/courses/$CA/grade-scale "$(SCALE 120 75 70 50)"; check "scale A = 120" 400 '"A":"Must be between 0 and 100."'
req "$JA" PUT /api/courses/$CA/grade-scale "$(SCALE 80 75 70 0)"; check "scale D = 0" 400 '"D":"Must be above 0."'
req "$JA" PUT /api/courses/$CA/grade-scale '[{"letter":"A","minPercent":80}]'; check "scale with 1 entry" 400 '"gradeScale"'
echo "     DB still A=85 after rejected updates: $(sql "SELECT min_percent FROM course_grade_scale WHERE course_id=$CA AND letter='A'")"
req "$JA" PUT /api/courses/$CA '{"code":"WEB101","name":"Web Programming II","credits":4}'; check "PUT course keeps scale A=85" 200 '{"letter":"A","minPercent":85.0}'

echo "== Tasks (user A)"
req "$JA" POST /api/tasks "{\"title\":\"Build portfolio\",\"courseId\":$CA,\"dueDate\":\"2026-12-05\"}"; check "POST task (status defaults to TODO)" 201 '"status":"TODO"'; TA=$(jid)
req "$JA" POST /api/tasks '{"title":"","courseId":999999,"dueDate":"2026-02-30","status":"LATE"}'; check "POST task invalid fields" 400 '"dueDate":"Pick a due date."'
req "$JA" PUT /api/tasks/$TA "{\"title\":\"Build portfolio v2\",\"courseId\":$CA,\"dueDate\":\"2026-12-06\",\"status\":\"IN_PROGRESS\"}"; check "PUT task" 200 '"dueDate":"2026-12-06"'
req "$JA" PATCH /api/tasks/$TA '{"status":"DONE"}'; check "PATCH task status DONE" 200 '"status":"DONE"'
req "$JA" PATCH /api/tasks/$TA '{"status":"OVERDUE"}'; check "PATCH invalid status" 400 '"status":"Choose a valid status."'
req "$JA" GET /api/tasks; check "GET tasks (14 = 13 sample + 1)" 200 '"title":"Build portfolio v2"'
echo "     task count for A: $(grep -o '"id":' <<<"$BODY" | wc -l)"

echo "== Grade items (user A)"
req "$JA" POST /api/courses/$CA/grade-items '{"name":"Project","type":"COURSEWORK","score":25,"maxScore":20,"weight":30}'; check "POST score > max" 400 '"score":"Score can’t be higher than the max score."'
req "$JA" POST /api/courses/$CA/grade-items '{"name":"Project","type":"COURSEWORK","maxScore":20,"weight":0}'; check "POST weight 0" 400 '"weight":"Weight must be more than 0 and at most 100%."'
req "$JA" POST /api/courses/$CA/grade-items '{"name":"Project","type":"COURSEWORK","maxScore":20,"weight":101}'; check "POST weight 101" 400 '"weight"'
req "$JA" POST /api/courses/$CA/grade-items '{"name":"Project","type":"COURSEWORK","score":-1,"maxScore":20,"weight":30}'; check "POST negative score" 400 '"score":"Score can’t be negative."'
req "$JA" POST /api/courses/$CA/grade-items '{"name":"Project","type":"COURSEWORK","score":18,"maxScore":20,"weight":30}'; check "POST grade item" 201 '"score":18.0'; GA=$(jid)
req "$JA" POST /api/courses/$CA/grade-items '{"name":"Final","type":"FINAL","maxScore":100,"weight":70}'; check "POST final, no score (null)" 201 '"score":null'
req "$JA" PATCH /api/grade-items/$GA '{"score":19.5}'; check "PATCH score 19.5" 200 '"score":19.5'
req "$JA" PATCH /api/grade-items/$GA '{"maxScore":10}'; check "PATCH maxScore below saved score" 400 '"score"'
req "$JA" PATCH /api/grade-items/$GA '{"score":null}'; check "PATCH score null (not graded)" 200 '"score":null'
req "$JA" GET /api/courses/$CA/grade-items; check "GET grade items (2)" 200 '"name":"Final"'
req "$JA" DELETE /api/grade-items/$GA; check "DELETE grade item" 204
req "$JA" DELETE /api/grade-items/$GA; check "DELETE same grade item again" 404

echo "== Isolation: user A uses user B's ids"
req "$JB" POST /api/courses '{"code":"BONLY","name":"B only","credits":2}'; CB=$(jid)
req "$JB" POST /api/tasks "{\"title\":\"B task\",\"courseId\":$CB,\"dueDate\":\"2026-12-01\"}"; TB=$(jid)
req "$JB" POST /api/courses/$CB/grade-items '{"name":"B quiz","type":"COURSEWORK","score":5,"maxScore":10,"weight":10}'; GB=$(jid)
echo "     B ids: course=$CB task=$TB gradeItem=$GB"
req "$JA" GET /api/courses/$CB/grade-items; check "A GET B's course grade items" 404 '"message":"Course not found."'
req "$JA" POST /api/courses/$CB/grade-items '{"name":"X","type":"FINAL","maxScore":100,"weight":10}'; check "A POST grade item into B's course" 404
req "$JA" PUT /api/courses/$CB '{"code":"HACK","name":"Hack","credits":3}'; check "A PUT B's course" 404
req "$JA" PUT /api/courses/$CB/grade-scale "$(SCALE 85 75 70 50)"; check "A PUT B's grade scale" 404
req "$JA" DELETE /api/courses/$CB; check "A DELETE B's course" 404
req "$JA" PUT /api/tasks/$TB "{\"title\":\"X\",\"courseId\":$CA,\"dueDate\":\"2026-12-01\"}"; check "A PUT B's task" 404 '"message":"Task not found."'
req "$JA" PATCH /api/tasks/$TB '{"status":"DONE"}'; check "A PATCH B's task" 404
req "$JA" DELETE /api/tasks/$TB; check "A DELETE B's task" 404
req "$JA" PATCH /api/grade-items/$GB '{"score":10}'; check "A PATCH B's grade item" 404 '"message":"Assessment not found."'
req "$JA" DELETE /api/grade-items/$GB; check "A DELETE B's grade item" 404
req "$JA" POST /api/tasks "{\"title\":\"X\",\"courseId\":$CB,\"dueDate\":\"2026-12-01\"}"; check "A POST task into B's course" 400 '"courseId":"Choose a course."'
req "$JA" GET /api/courses; [ "$CODE" = 200 ] && grep -q '"code":"WEB101"' <<<"$BODY" && ! grep -q BONLY <<<"$BODY" && CODE=ok || CODE="leak/$CODE"; check "A's course list has no B course" ok
req "$JA" GET /api/tasks; [ "$CODE" = 200 ] && grep -q '"title":"Build portfolio v2"' <<<"$BODY" && ! grep -q '"title":"B task"' <<<"$BODY" && CODE=ok || CODE="leak/$CODE"; check "A's task list has no B task" ok
req "$JB" GET /api/courses/$CB/grade-items; check "B's grade item unchanged (score 5)" 200 '"score":5.0'
req "$JB" GET /api/tasks; check "B's task still TODO" 200 '"title":"B task","dueDate":"2026-12-01","status":"TODO"'

echo "== Cascade delete (real tables)"
req "$JA" POST /api/courses '{"code":"DEL101","name":"To be deleted","credits":3}'; CD=$(jid)
req "$JA" POST /api/tasks "{\"title\":\"t1\",\"courseId\":$CD,\"dueDate\":\"2026-12-01\"}"
req "$JA" POST /api/tasks "{\"title\":\"t2\",\"courseId\":$CD,\"dueDate\":\"2026-12-02\"}"
req "$JA" POST /api/courses/$CD/grade-items '{"name":"q1","type":"COURSEWORK","score":8,"maxScore":10,"weight":50}'
req "$JA" POST /api/courses/$CD/grade-items '{"name":"f","type":"FINAL","maxScore":100,"weight":50}'
counts() { sql "SELECT (SELECT COUNT(*) FROM courses WHERE id=$1), (SELECT COUNT(*) FROM tasks WHERE course_id=$1), (SELECT COUNT(*) FROM grade_items WHERE course_id=$1), (SELECT COUNT(*) FROM course_grade_scale WHERE course_id=$1)"; }
echo "     before delete  courses/tasks/grade_items/grade_scale for course $CD: $(counts $CD)"
req "$JA" DELETE /api/courses/$CD; check "DELETE course" 204
echo "     after delete   courses/tasks/grade_items/grade_scale for course $CD: $(counts $CD)"
AFTER=$(counts $CD | tr -s ' \t' ' '); [ "$AFTER" = "0 0 0 0" ] && CODE=ok || CODE="$AFTER"; check "all rows of the deleted course are gone" ok
echo "     other course $CA still has scale rows: $(sql "SELECT COUNT(*) FROM course_grade_scale WHERE course_id=$CA")"

echo; echo "RESULT: $PASS passed, $FAILN failed"
[ "$FAILN" = 0 ]
