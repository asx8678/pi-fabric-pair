#include <node_api.h>
#include <sys/types.h>
#include <sys/stat.h>
#include <sys/mount.h>
#include <sys/file.h>
#include <fcntl.h>
#include <unistd.h>
#include <dirent.h>
#include <errno.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>

#define MAX_BYTES (64 * 1024 * 1024)
typedef struct { int fd; int directory; } capability;
static const napi_type_tag capability_tag = { 0x3a9f5142daef6b87ULL, 0xb0172cd698ec43a5ULL };
static napi_value error_value(napi_env env, const char *message, int saved) {
  const char *code = saved == ENOENT ? "ENOENT" : saved == EEXIST ? "EEXIST" : saved == EWOULDBLOCK ? "EWOULDBLOCK" : saved == ELOOP ? "ELOOP" : "ESTORE";
  char text[256];
  snprintf(text, sizeof(text), "%s: %s", message, strerror(saved));
  napi_value error, code_value, text_value, number, operation;
  napi_create_string_utf8(env, code, NAPI_AUTO_LENGTH, &code_value);
  napi_create_string_utf8(env, text, NAPI_AUTO_LENGTH, &text_value);
  napi_create_error(env, code_value, text_value, &error);
  napi_create_int32(env, saved, &number);
  napi_set_named_property(env, error, "errno", number);
  napi_create_string_utf8(env, message, NAPI_AUTO_LENGTH, &operation);
  napi_set_named_property(env, error, "operation", operation);
  return error;
}
static napi_value fail_errors(napi_env env, const char *message, int primary, int cleanup, const char *cleanup_message) {
  napi_value error = error_value(env, primary ? message : cleanup_message, primary ? primary : cleanup);
  if (primary && cleanup) napi_set_named_property(env, error, "cause", error_value(env, cleanup_message, cleanup));
  napi_throw(env, error);
  return NULL;
}
static napi_value fail(napi_env env, const char *message) { return fail_errors(env, message, errno, 0, message); }
static int close_checked(napi_env env, int fd, int primary, const char *message) {
  int cleanup = close(fd) ? errno : 0;
  if (primary || cleanup) { fail_errors(env, message, primary, cleanup, "Close descriptor"); return 0; }
  return 1;
}
static napi_value invalid(napi_env env, const char *message) { errno = EINVAL; return fail(env, message); }
static napi_value done(napi_env env) { napi_value v; napi_get_undefined(env, &v); return v; }
static int args(napi_env env, napi_callback_info info, size_t count, napi_value *values) {
  size_t actual = count;
  if (napi_get_cb_info(env, info, &actual, values, NULL, NULL) != napi_ok || actual != count) { invalid(env, "Invalid native arguments"); return 0; }
  return 1;
}
static capability *cap(napi_env env, napi_value value, int directory) {
  void *p = NULL; bool tagged = false; napi_valuetype type;
  if (napi_typeof(env, value, &type) != napi_ok || type != napi_object) { invalid(env, "Addon-owned descriptor capability required"); return NULL; }
  if (napi_check_object_type_tag(env, value, &capability_tag, &tagged) != napi_ok || !tagged) { invalid(env, "Addon-owned descriptor capability required"); return NULL; }
  if (napi_unwrap(env, value, &p) != napi_ok || !p) { invalid(env, "Descriptor capability required"); return NULL; }
  capability *c = p;
  if (c->fd < 0 || (directory && !c->directory)) { invalid(env, "Closed or wrong descriptor capability"); return NULL; }
  return c;
}
static int name(napi_env env, napi_value value, char *out) {
  size_t length = 0;
  if (napi_get_value_string_utf8(env, value, out, 256, &length) != napi_ok || !length || length >= 255 || strlen(out) != length || strchr(out, '/') || !strcmp(out, ".") || !strcmp(out, "..")) { invalid(env, "Invalid single-component name"); return 0; }
  return 1;
}
static void finalize(napi_env env, void *data, void *hint) { (void)env; (void)hint; capability *c = data; if (c->fd >= 0) close(c->fd); free(c); }
static napi_value wrap(napi_env env, int fd, int directory) {
  capability *c = calloc(1, sizeof(*c));
  if (!c) { close_checked(env, fd, ENOMEM, "Allocate capability"); return NULL; }
  c->fd = fd; c->directory = directory;
  napi_value value;
  if (napi_create_object(env, &value) != napi_ok || napi_type_tag_object(env, value, &capability_tag) != napi_ok || napi_wrap(env, value, c, finalize, NULL, NULL) != napi_ok) { free(c); close_checked(env, fd, EINVAL, "Create capability"); return NULL; }
  return value;
}
static int equal(const struct stat *a, const struct stat *b) { return a->st_dev == b->st_dev && a->st_ino == b->st_ino && a->st_mode == b->st_mode && a->st_uid == b->st_uid; }
static int regular(const struct stat *s) { return S_ISREG(s->st_mode) && s->st_nlink == 1 && s->st_uid == geteuid() && !(s->st_mode & 0077); }
static int private_dir(const struct stat *s) { return S_ISDIR(s->st_mode) && s->st_uid == geteuid() && !(s->st_mode & 0077); }
static int file_at(napi_env env, int dir, const char *entry, int flags, struct stat *before) {
  if (fstatat(dir, entry, before, AT_SYMLINK_NOFOLLOW)) { fail(env, "Inspect regular file"); return -1; }
  if (!regular(before)) { invalid(env, "Unsafe regular file"); return -1; }
  int fd = openat(dir, entry, flags | O_NOFOLLOW | O_CLOEXEC | O_NONBLOCK);
  if (fd < 0) { fail(env, "Open regular file"); return -1; }
  struct stat opened;
  int primary = fstat(fd, &opened) ? errno : (!regular(&opened) || !equal(before, &opened) ? ESTALE : 0);
  if (primary) { close_checked(env, fd, primary, "File identity"); return -1; }
  return fd;
}
static napi_value root(napi_env env, napi_callback_info info) {
  (void)info;
  int fd = open("/", O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
  if (fd < 0) return fail(env, "Open root");
  return wrap(env, fd, 1);
}
static napi_value child(napi_env env, napi_callback_info info) {
  napi_value a[3]; char entry[256]; int32_t mode;
  if (!args(env, info, 3, a)) return NULL;
  capability *p = cap(env, a[0], 1);
  if (!p || !name(env, a[1], entry)) return NULL;
  if (napi_get_value_int32(env, a[2], &mode) != napi_ok || mode < 0 || mode > 2) return invalid(env, "Invalid directory request");
  if (mode && mkdirat(p->fd, entry, 0700) && (mode == 2 || errno != EEXIST)) return fail(env, "Reserve directory");
  int fd = openat(p->fd, entry, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
  if (fd < 0) return fail(env, "Open directory");
  struct stat s, selected;
  int primary = (fstat(fd, &s) || fstatat(p->fd, entry, &selected, AT_SYMLINK_NOFOLLOW)) ? errno : (!equal(&s, &selected) || !S_ISDIR(s.st_mode) || (mode && !private_dir(&s)) ? ESTALE : 0);
  if (primary) { close_checked(env, fd, primary, "Directory identity/private mode"); return NULL; }
  if (mode && (fsync(fd) || fsync(p->fd))) { close_checked(env, fd, errno, "Sync directory creation"); return NULL; }
  return wrap(env, fd, 1);
}
static void number(napi_env env, napi_value object, const char *key, double n) { napi_value v; napi_create_double(env, n, &v); napi_set_named_property(env, object, key, v); }
static napi_value stat_cap(napi_env env, napi_callback_info info) {
  napi_value a[1], out;
  if (!args(env, info, 1, a)) return NULL;
  capability *c = cap(env, a[0], 0); if (!c) return NULL;
  struct stat s; if (fstat(c->fd, &s)) return fail(env, "Stat descriptor");
  napi_create_object(env, &out);
  number(env, out, "dev", (double)s.st_dev); number(env, out, "ino", (double)s.st_ino); number(env, out, "mode", s.st_mode); number(env, out, "uid", s.st_uid); number(env, out, "nlink", (double)s.st_nlink); number(env, out, "size", (double)s.st_size);
  return out;
}
static napi_value stat_file(napi_env env, napi_callback_info info) {
  napi_value a[2], out; char entry[256];
  if (!args(env, info, 2, a)) return NULL;
  capability *p = cap(env, a[0], 1); if (!p || !name(env, a[1], entry)) return NULL;
  struct stat s; int fd = file_at(env, p->fd, entry, O_RDONLY, &s);
  if (fd < 0) return NULL;
  if (close(fd)) return fail(env, "Close stat file");
  napi_create_object(env, &out);
  number(env, out, "dev", (double)s.st_dev); number(env, out, "ino", (double)s.st_ino); number(env, out, "mode", s.st_mode); number(env, out, "uid", s.st_uid); number(env, out, "nlink", (double)s.st_nlink); number(env, out, "size", (double)s.st_size);
  return out;
}
static napi_value check(napi_env env, napi_callback_info info) {
  napi_value a[3]; char entry[256];
  if (!args(env, info, 3, a)) return NULL;
  capability *p = cap(env, a[0], 1); if (!p) return NULL;
  capability *c = cap(env, a[2], 0); if (!c || !name(env, a[1], entry)) return NULL;
  struct stat s, selected;
  if (fstat(c->fd, &s) || fstatat(p->fd, entry, &selected, AT_SYMLINK_NOFOLLOW)) return fail(env, "Inspect retained namespace");
  if (!equal(&s, &selected) || (c->directory ? !S_ISDIR(s.st_mode) : (!regular(&s) || s.st_size != 0))) { errno = ESTALE; return fail(env, "Retained namespace replaced"); }
  return done(env);
}
static napi_value close_cap(napi_env env, napi_callback_info info) {
  napi_value a[1]; if (!args(env, info, 1, a)) return NULL;
  capability *c = cap(env, a[0], 0); if (!c) return NULL;
  int fd = c->fd; c->fd = -1;
  if (close(fd)) return fail(env, "Close descriptor");
  return done(env);
}
static napi_value sync_cap(napi_env env, napi_callback_info info) {
  napi_value a[1]; if (!args(env, info, 1, a)) return NULL;
  capability *c = cap(env, a[0], 0); if (!c) return NULL;
  if (fsync(c->fd)) return fail(env, "Sync descriptor");
  return done(env);
}
static napi_value profile(napi_env env, napi_callback_info info) {
  napi_value a[1], out; if (!args(env, info, 1, a)) return NULL;
  capability *c = cap(env, a[0], 1); if (!c) return NULL;
  struct stat s; struct statfs f;
  if (fstat(c->fd, &s) || fstatfs(c->fd, &f)) return fail(env, "Profile descriptor");
  if (!private_dir(&s) || strcmp(f.f_fstypename, "apfs") || !(f.f_flags & MNT_LOCAL) || (f.f_flags & MNT_RDONLY)) return invalid(env, "Only private writable local APFS is supported");
  if (fsync(c->fd)) return fail(env, "Profile directory sync");
  napi_create_string_utf8(env, "darwin-arm64-private-local-apfs-v1", NAPI_AUTO_LENGTH, &out); return out;
}
static napi_value read_file(napi_env env, napi_callback_info info) {
  napi_value a[3], out; char entry[256]; double maximum;
  if (!args(env, info, 3, a)) return NULL;
  capability *p = cap(env, a[0], 1);
  if (!p || !name(env, a[1], entry)) return NULL;
  if (napi_get_value_double(env, a[2], &maximum) != napi_ok || !(maximum >= 0 && maximum <= MAX_BYTES) || maximum != (double)(uint32_t)maximum) return invalid(env, "Invalid read bound");
  struct stat before, after, selected;
  int fd = file_at(env, p->fd, entry, O_RDONLY, &before); if (fd < 0) return NULL;
  if (before.st_size < 0 || before.st_size > maximum) { close_checked(env, fd, EOVERFLOW, "File exceeds byte ceiling"); return NULL; }
  size_t size = (size_t)before.st_size; unsigned char *data = malloc(size + 1); size_t used = 0;
  if (!data) { close_checked(env, fd, ENOMEM, "Read buffer"); return NULL; }
  int primary = 0;
  while (used <= size) { ssize_t n = read(fd, data + used, size + 1 - used); if (n < 0 && errno == EINTR) continue; if (n < 0) { primary = errno; break; } if (!n) break; used += (size_t)n; }
  if (!primary && (fstat(fd, &after) || fstatat(p->fd, entry, &selected, AT_SYMLINK_NOFOLLOW))) primary = errno;
  if (!primary && (used != size || !regular(&after) || !equal(&before, &after) || !equal(&after, &selected) || after.st_size != before.st_size || selected.st_size != after.st_size || before.st_mtimespec.tv_sec != after.st_mtimespec.tv_sec || before.st_mtimespec.tv_nsec != after.st_mtimespec.tv_nsec || before.st_ctimespec.tv_sec != after.st_ctimespec.tv_sec || before.st_ctimespec.tv_nsec != after.st_ctimespec.tv_nsec || selected.st_ctimespec.tv_sec != after.st_ctimespec.tv_sec || selected.st_ctimespec.tv_nsec != after.st_ctimespec.tv_nsec)) primary = ESTALE;
  if (!close_checked(env, fd, primary, "Bounded read changed or failed")) { free(data); return NULL; }
  napi_status status = napi_create_buffer_copy(env, size, data, NULL, &out); free(data);
  if (status != napi_ok) return invalid(env, "Create read result");
  return out;
}
static napi_value write_file(napi_env env, napi_callback_info info) {
  napi_value a[3]; char entry[256]; void *data; size_t size;
  if (!args(env, info, 3, a)) return NULL;
  capability *p = cap(env, a[0], 1);
  if (!p || !name(env, a[1], entry)) return NULL;
  if (napi_get_buffer_info(env, a[2], &data, &size) != napi_ok || size > MAX_BYTES) return invalid(env, "Invalid write bytes");
  int fd = openat(p->fd, entry, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW | O_CLOEXEC, 0600);
  if (fd < 0) return fail(env, "Exclusive file creation");
  size_t used = 0; int primary = 0;
  while (used < size) { ssize_t n = write(fd, (char *)data + used, size - used); if (n < 0 && errno == EINTR) continue; if (n <= 0) { primary = n < 0 ? errno : EIO; break; } used += (size_t)n; }
  if (!primary && fsync(fd)) primary = errno;
  if (!close_checked(env, fd, primary, "Write/sync file")) return NULL;
  if (fsync(p->fd)) return fail(env, "Sync written directory");
  return done(env);
}
static napi_value rename_file(napi_env env, napi_callback_info info) {
  napi_value a[4]; char source[256], target[256];
  if (!args(env, info, 4, a)) return NULL;
  capability *p = cap(env, a[0], 1); if (!p) return NULL;
  capability *q = cap(env, a[2], 1); if (!q || !name(env, a[1], source) || !name(env, a[3], target)) return NULL;
  struct stat s, t;
  if (fstatat(p->fd, source, &s, AT_SYMLINK_NOFOLLOW)) return fail(env, "Inspect rename source");
  if (!regular(&s)) return invalid(env, "Unsafe rename source");
  if (!fstatat(q->fd, target, &t, AT_SYMLINK_NOFOLLOW)) { if (!regular(&t)) return invalid(env, "Unsafe rename target"); }
  else if (errno != ENOENT) return fail(env, "Inspect rename target");
  if (renameat(p->fd, source, q->fd, target)) return fail(env, "Rename relative file");
  if (fsync(p->fd) || fsync(q->fd)) return fail(env, "Sync rename directories");
  return done(env);
}
static napi_value listing(napi_env env, napi_callback_info info) {
  napi_value a[1], out; if (!args(env, info, 1, a)) return NULL;
  capability *c = cap(env, a[0], 1); if (!c) return NULL;
  int fd = openat(c->fd, ".", O_RDONLY | O_DIRECTORY | O_CLOEXEC); if (fd < 0) return fail(env, "Open inventory");
  DIR *d = fdopendir(fd); if (!d) { close_checked(env, fd, errno, "Directory inventory"); return NULL; }
  napi_create_array(env, &out); unsigned int count = 0; int primary = 0;
  for (;;) {
    errno = 0; struct dirent *entry = readdir(d);
    if (!entry) { primary = errno; break; }
    if (!strcmp(entry->d_name, ".") || !strcmp(entry->d_name, "..")) continue;
    if (count == 64) { primary = EOVERFLOW; break; }
    napi_value v; napi_create_string_utf8(env, entry->d_name, NAPI_AUTO_LENGTH, &v); napi_set_element(env, out, count++, v);
  }
  int cleanup = closedir(d) ? errno : 0;
  if (primary || cleanup) return fail_errors(env, "Inventory exceeds bound or failed", primary, cleanup, "Close inventory");
  return out;
}
static napi_value lock_file(napi_env env, napi_callback_info info) {
  napi_value a[2]; bool fresh;
  if (!args(env, info, 2, a)) return NULL;
  capability *p = cap(env, a[0], 1); if (!p) return NULL;
  if (napi_get_value_bool(env, a[1], &fresh) != napi_ok) return invalid(env, "Invalid lock request");
  struct stat before;
  int fd = fresh ? openat(p->fd, "anchor", O_RDWR | O_CREAT | O_EXCL | O_NOFOLLOW | O_CLOEXEC, 0600) : file_at(env, p->fd, "anchor", O_RDWR, &before);
  if (fd < 0) return fresh ? fail(env, "Open permanent lock anchor") : NULL;
  if (flock(fd, LOCK_EX | LOCK_NB)) { close_checked(env, fd, errno, "Owner anchor held"); return NULL; }
  struct stat s, selected;
  int primary = (fstat(fd, &s) || fstatat(p->fd, "anchor", &selected, AT_SYMLINK_NOFOLLOW)) ? errno : (!regular(&s) || s.st_size != 0 || !equal(&s, &selected) ? ESTALE : 0);
  if (!primary && (fsync(fd) || fsync(p->fd))) primary = errno;
  if (primary) { close_checked(env, fd, primary, "Lock anchor identity/sync"); return NULL; }
  return wrap(env, fd, 0);
}
static napi_value init(napi_env env, napi_value exports) {
  napi_property_descriptor properties[] = {
    {"root", NULL, root, NULL, NULL, NULL, napi_default, NULL},
    {"child", NULL, child, NULL, NULL, NULL, napi_default, NULL},
    {"stat", NULL, stat_cap, NULL, NULL, NULL, napi_default, NULL},
    {"check", NULL, check, NULL, NULL, NULL, napi_default, NULL},
    {"statFile", NULL, stat_file, NULL, NULL, NULL, napi_default, NULL},
    {"close", NULL, close_cap, NULL, NULL, NULL, napi_default, NULL},
    {"sync", NULL, sync_cap, NULL, NULL, NULL, napi_default, NULL},
    {"profile", NULL, profile, NULL, NULL, NULL, napi_default, NULL},
    {"read", NULL, read_file, NULL, NULL, NULL, napi_default, NULL},
    {"write", NULL, write_file, NULL, NULL, NULL, napi_default, NULL},
    {"rename", NULL, rename_file, NULL, NULL, NULL, napi_default, NULL},
    {"list", NULL, listing, NULL, NULL, NULL, napi_default, NULL},
    {"lock", NULL, lock_file, NULL, NULL, NULL, napi_default, NULL}
  };
  napi_define_properties(env, exports, sizeof(properties) / sizeof(properties[0]), properties);
  return exports;
}
NAPI_MODULE(NODE_GYP_MODULE_NAME, init)
