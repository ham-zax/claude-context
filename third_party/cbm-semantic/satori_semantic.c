#include "satori_semantic.h"
#include "common/arena.h"
#include "common/scope.h"
#include "common/type_rep.h"
#include "common/type_registry.h"
#include "common/lsp_node_iter.h"
#include "languages/go/go_lsp.h"
#include "minimal-compat/cbm_compat.h"
#include "tree_sitter/api.h"
#include "helpers.h"
#include <stdlib.h>
#include <string.h>
#include <stdio.h>

extern const TSLanguage *tree_sitter_go(void);

#define SATORI_ENGINE_VERSION_STR "cbm-d150ebe4+satori-go-semantic-v2"

typedef struct {
    char *path;
    uint32_t path_len;
    char *source;
    uint32_t source_len;
} SatoriSourceFile;

typedef struct {
    char *role;
    uint32_t role_len;
    char *path;
    uint32_t path_len;
    char *source;
    uint32_t source_len;
} SatoriAuxiliaryFile;

typedef struct {
    char *data;
    uint32_t len;
    uint32_t cap;
} SatoriStringTable;

typedef struct {
    bool active;
    uint32_t handle_id;
    char language[32];

    CBMArena arena;

    SatoriSourceFile *sources;
    uint32_t source_count;
    uint32_t source_cap;
    uint64_t total_source_bytes;

    SatoriAuxiliaryFile *auxiliaries;
    uint32_t aux_count;
    uint32_t aux_cap;
    uint64_t total_aux_bytes;

    SatoriSemanticResultV1 *results;
    uint32_t result_count;
    uint32_t result_cap;

    SatoriStringTable str_table;
    char last_error[512];
} SatoriSession;

static SatoriSession s_sessions[SATORI_MAX_HANDLES];
static uint32_t s_next_handle_id = 1;
static char s_global_last_error[512] = "";

static void set_global_error(const char *msg) {
    if (!msg) {
        s_global_last_error[0] = '\0';
        return;
    }
    strncpy(s_global_last_error, msg, sizeof(s_global_last_error) - 1);
    s_global_last_error[sizeof(s_global_last_error) - 1] = '\0';
}

static void set_session_error(SatoriSession *s, const char *msg) {
    if (!s) return;
    if (!msg) {
        s->last_error[0] = '\0';
        return;
    }
    strncpy(s->last_error, msg, sizeof(s->last_error) - 1);
    s->last_error[sizeof(s->last_error) - 1] = '\0';
}

static SatoriSession *find_session(SatoriSemanticHandle handle) {
    if (handle == 0) return NULL;
    for (int i = 0; i < SATORI_MAX_HANDLES; i++) {
        if (s_sessions[i].active && s_sessions[i].handle_id == handle) {
            return &s_sessions[i];
        }
    }
    return NULL;
}

static bool str_table_intern_checked(SatoriStringTable *st, const char *str, uint32_t len, uint32_t *out_offset, uint32_t *out_len) {
    if (!out_offset || !out_len) return false;
    if (!str || len == 0) {
        *out_offset = 0;
        *out_len = 0;
        return true;
    }

    /* Check if already present */
    if (st->data && st->len > 0) {
        for (uint32_t i = 0; i + len <= st->len; i++) {
            if (memcmp(st->data + i, str, len) == 0 && (i + len == st->len || st->data[i + len] == '\0')) {
                *out_offset = i;
                *out_len = len;
                return true;
            }
        }
    }

    /* Append to string table */
    uint32_t needed = st->len + len + 1;
    if (needed > SATORI_MAX_STR_TABLE_BYTES) {
        *out_offset = 0;
        *out_len = 0;
        return false;
    }
    if (needed > st->cap) {
        uint32_t new_cap = st->cap == 0 ? 1024 : st->cap * 2;
        while (new_cap < needed) new_cap *= 2;
        char *new_data = (char *)realloc(st->data, new_cap);
        if (!new_data) {
            *out_offset = 0;
            *out_len = 0;
            return false;
        }
        st->data = new_data;
        st->cap = new_cap;
    }

    uint32_t offset = st->len;
    memcpy(st->data + offset, str, len);
    st->data[offset + len] = '\0';
    st->len += len + 1;
    *out_offset = offset;
    *out_len = len;
    return true;
}

uint32_t satori_semantic_abi_version(void) {
    return SATORI_SEMANTIC_ABI_VERSION;
}

const char *satori_semantic_engine_version(void) {
    return SATORI_ENGINE_VERSION_STR;
}

const char *satori_semantic_global_last_error_message(void) {
    return s_global_last_error;
}

const char *satori_semantic_last_error_message(SatoriSemanticHandle handle) {
    SatoriSession *s = find_session(handle);
    if (!s) return s_global_last_error;
    return s->last_error;
}

const char *satori_semantic_last_error(SatoriSemanticHandle handle) {
    return satori_semantic_last_error_message(handle);
}

int satori_semantic_create(const char *language, uint32_t language_len, SatoriSemanticHandle *out_handle) {
    if (!out_handle) {
        set_global_error("Null out_handle pointer");
        return SATORI_SEMANTIC_ERR_INVALID_ARGUMENT;
    }
    *out_handle = 0;

    if (!language || language_len != 2 || memcmp(language, "go", 2) != 0) {
        set_global_error("Unsupported semantic language");
        return SATORI_SEMANTIC_ERR_INVALID_ARGUMENT;
    }

    /* Find empty session slot */
    SatoriSession *s = NULL;
    for (int i = 0; i < SATORI_MAX_HANDLES; i++) {
        if (!s_sessions[i].active) {
            s = &s_sessions[i];
            break;
        }
    }

    if (!s) {
        set_global_error("Max session handles exceeded (64)");
        return SATORI_SEMANTIC_ERR_RESOURCE_LIMIT_EXCEEDED;
    }

    memset(s, 0, sizeof(SatoriSession));
    s->active = true;
    s->handle_id = s_next_handle_id++;
    memcpy(s->language, language, language_len);
    s->language[language_len] = '\0';

    cbm_arena_init(&s->arena);

    *out_handle = s->handle_id;
    return SATORI_SEMANTIC_OK;
}

int satori_semantic_add_source(SatoriSemanticHandle handle, const char *path, uint32_t path_len, const char *source, uint32_t source_len) {
    SatoriSession *s = find_session(handle);
    if (!s) {
        set_global_error("Handle not found in add_source");
        return SATORI_SEMANTIC_ERR_HANDLE_NOT_FOUND;
    }

    if (!path || path_len == 0 || !source) {
        set_session_error(s, "Invalid source arguments");
        return SATORI_SEMANTIC_ERR_INVALID_ARGUMENT;
    }

    if (s->source_count >= SATORI_MAX_SOURCES) {
        set_session_error(s, "Max source files exceeded (20000)");
        return SATORI_SEMANTIC_ERR_RESOURCE_LIMIT_EXCEEDED;
    }

    if ((uint64_t)source_len > SATORI_MAX_TOTAL_SOURCE_BYTES ||
        s->total_source_bytes > SATORI_MAX_TOTAL_SOURCE_BYTES - (uint64_t)source_len) {
        set_session_error(s, "Total source bytes limit exceeded (100MB)");
        return SATORI_SEMANTIC_ERR_RESOURCE_LIMIT_EXCEEDED;
    }

    uint64_t current_input_bytes = s->total_source_bytes + s->total_aux_bytes;
    if ((uint64_t)source_len > SATORI_MAX_TOTAL_INPUT_BYTES ||
        current_input_bytes > SATORI_MAX_TOTAL_INPUT_BYTES - (uint64_t)source_len) {
        set_session_error(s, "Total input bytes limit exceeded (110MB)");
        return SATORI_SEMANTIC_ERR_RESOURCE_LIMIT_EXCEEDED;
    }

    if (s->source_count >= s->source_cap) {
        uint32_t new_cap = s->source_cap == 0 ? 16 : s->source_cap * 2;
        SatoriSourceFile *new_sources = (SatoriSourceFile *)realloc(s->sources, new_cap * sizeof(SatoriSourceFile));
        if (!new_sources) {
            set_session_error(s, "Out of memory allocating source files array");
            return SATORI_SEMANTIC_ERR_OUT_OF_MEMORY;
        }
        s->sources = new_sources;
        s->source_cap = new_cap;
    }

    char *path_copy = (char *)malloc(path_len + 1);
    char *src_copy = (char *)malloc(source_len + 1);
    if (!path_copy || !src_copy) {
        free(path_copy);
        free(src_copy);
        set_session_error(s, "Out of memory duplicating source file content");
        return SATORI_SEMANTIC_ERR_OUT_OF_MEMORY;
    }

    memcpy(path_copy, path, path_len);
    path_copy[path_len] = '\0';
    memcpy(src_copy, source, source_len);
    src_copy[source_len] = '\0';

    s->sources[s->source_count].path = path_copy;
    s->sources[s->source_count].path_len = path_len;
    s->sources[s->source_count].source = src_copy;
    s->sources[s->source_count].source_len = source_len;
    s->source_count++;
    s->total_source_bytes += source_len;

    return SATORI_SEMANTIC_OK;
}

int satori_semantic_add_auxiliary(SatoriSemanticHandle handle, const char *role, uint32_t role_len, const char *path, uint32_t path_len, const char *source, uint32_t source_len) {
    SatoriSession *s = find_session(handle);
    if (!s) {
        set_global_error("Handle not found in add_auxiliary");
        return SATORI_SEMANTIC_ERR_HANDLE_NOT_FOUND;
    }

    if (!role || role_len == 0 || !path || path_len == 0 || !source) {
        set_session_error(s, "Invalid auxiliary arguments");
        return SATORI_SEMANTIC_ERR_INVALID_ARGUMENT;
    }

    if (s->aux_count >= SATORI_MAX_AUXILIARIES) {
        set_session_error(s, "Max auxiliary files exceeded (1000)");
        return SATORI_SEMANTIC_ERR_RESOURCE_LIMIT_EXCEEDED;
    }

    if ((uint64_t)source_len > SATORI_MAX_AGGREGATE_AUXILIARY_BYTES ||
        s->total_aux_bytes > SATORI_MAX_AGGREGATE_AUXILIARY_BYTES - (uint64_t)source_len) {
        set_session_error(s, "Total auxiliary bytes limit exceeded (10MB)");
        return SATORI_SEMANTIC_ERR_RESOURCE_LIMIT_EXCEEDED;
    }

    uint64_t current_input_bytes = s->total_source_bytes + s->total_aux_bytes;
    if ((uint64_t)source_len > SATORI_MAX_TOTAL_INPUT_BYTES ||
        current_input_bytes > SATORI_MAX_TOTAL_INPUT_BYTES - (uint64_t)source_len) {
        set_session_error(s, "Total input bytes limit exceeded (110MB)");
        return SATORI_SEMANTIC_ERR_RESOURCE_LIMIT_EXCEEDED;
    }

    if (s->aux_count >= s->aux_cap) {
        uint32_t new_cap = s->aux_cap == 0 ? 8 : s->aux_cap * 2;
        SatoriAuxiliaryFile *new_aux = (SatoriAuxiliaryFile *)realloc(s->auxiliaries, new_cap * sizeof(SatoriAuxiliaryFile));
        if (!new_aux) {
            set_session_error(s, "Out of memory allocating auxiliary files array");
            return SATORI_SEMANTIC_ERR_OUT_OF_MEMORY;
        }
        s->auxiliaries = new_aux;
        s->aux_cap = new_cap;
    }

    char *role_copy = (char *)malloc(role_len + 1);
    char *path_copy = (char *)malloc(path_len + 1);
    char *src_copy = (char *)malloc(source_len + 1);
    if (!role_copy || !path_copy || !src_copy) {
        free(role_copy);
        free(path_copy);
        free(src_copy);
        set_session_error(s, "Out of memory duplicating auxiliary file content");
        return SATORI_SEMANTIC_ERR_OUT_OF_MEMORY;
    }

    memcpy(role_copy, role, role_len);
    role_copy[role_len] = '\0';
    memcpy(path_copy, path, path_len);
    path_copy[path_len] = '\0';
    memcpy(src_copy, source, source_len);
    src_copy[source_len] = '\0';

    s->auxiliaries[s->aux_count].role = role_copy;
    s->auxiliaries[s->aux_count].role_len = role_len;
    s->auxiliaries[s->aux_count].path = path_copy;
    s->auxiliaries[s->aux_count].path_len = path_len;
    s->auxiliaries[s->aux_count].source = src_copy;
    s->auxiliaries[s->aux_count].source_len = source_len;
    s->aux_count++;
    s->total_aux_bytes += source_len;

    return SATORI_SEMANTIC_OK;
}

static uint8_t map_strategy(const char *strat) {
    if (!strat) return SATORI_STRATEGY_UNKNOWN;
    if (strstr(strat, "direct")) return SATORI_STRATEGY_DIRECT_CALL;
    if (strstr(strat, "type_dispatch")) return SATORI_STRATEGY_TYPE_DISPATCH;
    if (strstr(strat, "embed")) return SATORI_STRATEGY_EMBED_DISPATCH;
    if (strstr(strat, "interface")) return SATORI_STRATEGY_INTERFACE_DISPATCH;
    return SATORI_STRATEGY_UNKNOWN;
}

typedef struct {
    const char *qualified_name;
    const char *file_path;
    uint32_t file_path_len;
    uint32_t start_byte;
    uint32_t end_byte;
    const char *package_qn;
    const char *import_path;
} SatoriDefLoc;

typedef struct {
    SatoriDefLoc *items;
    uint32_t count;
    uint32_t cap;
} SatoriDefLocArray;

typedef enum {
    SATORI_DEF_LOOKUP_NONE = 0,
    SATORI_DEF_LOOKUP_UNIQUE,
    SATORI_DEF_LOOKUP_AMBIGUOUS,
} SatoriDefLookupState;

static int def_locs_add(SatoriDefLocArray *arr, const char *qn, const char *path,
                        uint32_t path_len, uint32_t start, uint32_t end,
                        const char *package_qn, const char *import_path) {
    if (!arr || !qn || !path || !package_qn) return SATORI_SEMANTIC_ERR_INVALID_ARGUMENT;
    if (arr->count >= SATORI_MAX_DEFINITIONS) {
        return SATORI_SEMANTIC_ERR_RESOURCE_LIMIT_EXCEEDED;
    }
    if (arr->count >= arr->cap) {
        uint32_t new_cap = arr->cap == 0 ? 32 : arr->cap * 2;
        if (new_cap > SATORI_MAX_DEFINITIONS) new_cap = SATORI_MAX_DEFINITIONS;
        SatoriDefLoc *new_items = (SatoriDefLoc *)realloc(arr->items, new_cap * sizeof(SatoriDefLoc));
        if (!new_items) return SATORI_SEMANTIC_ERR_OUT_OF_MEMORY;
        arr->items = new_items;
        arr->cap = new_cap;
    }
    arr->items[arr->count].qualified_name = qn;
    arr->items[arr->count].file_path = path;
    arr->items[arr->count].file_path_len = path_len;
    arr->items[arr->count].start_byte = start;
    arr->items[arr->count].end_byte = end;
    arr->items[arr->count].package_qn = package_qn;
    arr->items[arr->count].import_path = import_path;
    arr->count++;
    return SATORI_SEMANTIC_OK;
}

static SatoriDefLookupState def_locs_find_unique(const SatoriDefLocArray *arr, const char *qn,
                                                  const SatoriDefLoc **out) {
    if (out) *out = NULL;
    if (!arr || !qn) return SATORI_DEF_LOOKUP_NONE;
    const SatoriDefLoc *match = NULL;
    for (uint32_t i = 0; i < arr->count; i++) {
        if (!arr->items[i].qualified_name || strcmp(arr->items[i].qualified_name, qn) != 0) continue;
        if (match) return SATORI_DEF_LOOKUP_AMBIGUOUS;
        match = &arr->items[i];
    }
    if (!match) return SATORI_DEF_LOOKUP_NONE;
    if (out) *out = match;
    return SATORI_DEF_LOOKUP_UNIQUE;
}

typedef struct {
    const char *root;
    const char *module_path;
} SatoriGoModule;

typedef struct {
    SatoriGoModule *items;
    uint32_t count;
} SatoriGoModuleTable;

typedef struct {
    const char *module_root;
    const char *module_path;
    const char *source_dir;
    const char *import_path;
    const char *package_qn;
    const char *declared_package_name;
    bool ambiguous;
} SatoriGoPackage;

typedef struct {
    SatoriGoPackage *items;
    uint32_t count;
} SatoriGoPackageTable;

typedef struct {
    const char *normalized_path;
    const char *source_dir;
    const char *declared_package_name;
    const char *package_qn;
    const char *import_path;
    const SatoriGoModule *module;
    uint32_t package_index;
    bool calls_eligible;
} SatoriGoSourceMeta;

typedef enum {
    SATORI_GO_PACKAGE_LOOKUP_NONE = 0,
    SATORI_GO_PACKAGE_LOOKUP_UNIQUE,
    SATORI_GO_PACKAGE_LOOKUP_AMBIGUOUS,
} SatoriGoPackageLookupState;

static const char *go_normalize_relative_path(CBMArena *arena, const char *path) {
    if (!arena || !path) return NULL;
    size_t len = strlen(path);
    char *out = (char *)cbm_arena_alloc(arena, len + 1);
    if (!out) return NULL;

    size_t i = 0;
    while (path[i] == '.' && path[i + 1] == '/') i += 2;
    size_t w = 0;
    bool previous_slash = false;
    for (; i < len; i++) {
        char c = path[i];
        if (c == '/') {
            if (previous_slash) continue;
            previous_slash = true;
        } else {
            previous_slash = false;
        }
        out[w++] = c;
    }
    while (w > 0 && out[w - 1] == '/') w--;
    if (w == 1 && out[0] == '.') w = 0;
    out[w] = '\0';
    return out;
}

static const char *go_dirname(CBMArena *arena, const char *normalized_path) {
    if (!arena || !normalized_path) return NULL;
    const char *slash = strrchr(normalized_path, '/');
    if (!slash) return "";
    return cbm_arena_strndup(arena, normalized_path, (size_t)(slash - normalized_path));
}

static int go_parse_module_path(CBMArena *arena, const char *source, const char **out_path) {
    if (out_path) *out_path = NULL;
    if (!arena || !source || !out_path) return SATORI_SEMANTIC_ERR_INVALID_ARGUMENT;

    const char *found = NULL;
    const char *p = source;
    while (*p) {
        const char *line_end = strchr(p, '\n');
        if (!line_end) line_end = p + strlen(p);
        const char *q = p;
        while (q < line_end && (*q == ' ' || *q == '\t' || *q == '\r')) q++;
        if (line_end - q >= 6 && strncmp(q, "module", 6) == 0 &&
            q + 6 < line_end && (q[6] == ' ' || q[6] == '\t')) {
            if (found) return SATORI_SEMANTIC_ERR_RESOLVE_FAILED;
            q += 6;
            while (q < line_end && (*q == ' ' || *q == '\t')) q++;
            if (q >= line_end) return SATORI_SEMANTIC_ERR_RESOLVE_FAILED;

            char quote = 0;
            if (*q == '"' || *q == '`') quote = *q++;
            const char *start = q;
            if (quote) {
                while (q < line_end && *q != quote) q++;
                if (q >= line_end || q == start) return SATORI_SEMANTIC_ERR_RESOLVE_FAILED;
            } else {
                while (q < line_end && *q != ' ' && *q != '\t' && *q != '\r') q++;
                if (q == start) return SATORI_SEMANTIC_ERR_RESOLVE_FAILED;
            }
            size_t path_len = (size_t)(q - start);
            if (path_len == 1 && start[0] == '(') return SATORI_SEMANTIC_ERR_RESOLVE_FAILED;
            found = cbm_arena_strndup(arena, start, path_len);
            if (!found) return SATORI_SEMANTIC_ERR_OUT_OF_MEMORY;
        }
        p = *line_end ? line_end + 1 : line_end;
    }

    if (!found) return SATORI_SEMANTIC_ERR_RESOLVE_FAILED;
    *out_path = found;
    return SATORI_SEMANTIC_OK;
}

static int go_build_module_table(CBMArena *arena, const SatoriAuxiliaryFile *auxiliaries,
                                 uint32_t aux_count, SatoriGoModuleTable *out) {
    memset(out, 0, sizeof(*out));
    if (!auxiliaries || aux_count == 0) return SATORI_SEMANTIC_OK;

    out->items = (SatoriGoModule *)calloc(aux_count, sizeof(SatoriGoModule));
    if (!out->items) return SATORI_SEMANTIC_ERR_OUT_OF_MEMORY;

    for (uint32_t i = 0; i < aux_count; i++) {
        const SatoriAuxiliaryFile *aux = &auxiliaries[i];
        if (!aux->path || !aux->source) continue;
        const char *normalized = go_normalize_relative_path(arena, aux->path);
        if (!normalized) return SATORI_SEMANTIC_ERR_OUT_OF_MEMORY;
        const char *base = strrchr(normalized, '/');
        const char *fname = base ? base + 1 : normalized;
        if (strcmp(fname, "go.mod") != 0) continue;

        const char *module_path = NULL;
        int parse_status = go_parse_module_path(arena, aux->source, &module_path);
        if (parse_status != SATORI_SEMANTIC_OK) return parse_status;
        const char *root = go_dirname(arena, normalized);
        if (!root) return SATORI_SEMANTIC_ERR_OUT_OF_MEMORY;

        bool duplicate = false;
        for (uint32_t j = 0; j < out->count; j++) {
            if (strcmp(out->items[j].root, root) != 0) continue;
            if (strcmp(out->items[j].module_path, module_path) != 0) {
                return SATORI_SEMANTIC_ERR_RESOLVE_FAILED;
            }
            duplicate = true;
            break;
        }
        if (duplicate) continue;
        out->items[out->count].root = root;
        out->items[out->count].module_path = module_path;
        out->count++;
    }
    return SATORI_SEMANTIC_OK;
}

static bool go_path_is_under_root(const char *path, const char *root) {
    if (!path || !root) return false;
    if (!root[0]) return true;
    size_t root_len = strlen(root);
    return strncmp(path, root, root_len) == 0 && path[root_len] == '/';
}

static const SatoriGoModule *go_find_nearest_module(const SatoriGoModuleTable *modules,
                                                     const char *normalized_source_path) {
    if (!modules || !normalized_source_path) return NULL;
    const SatoriGoModule *best = NULL;
    size_t best_len = 0;
    for (uint32_t i = 0; i < modules->count; i++) {
        const SatoriGoModule *candidate = &modules->items[i];
        if (!go_path_is_under_root(normalized_source_path, candidate->root)) continue;
        size_t root_len = strlen(candidate->root);
        if (!best || root_len > best_len) {
            best = candidate;
            best_len = root_len;
        }
    }
    return best;
}

static const char *go_compute_import_path(CBMArena *arena, const SatoriGoModule *module,
                                          const char *source_dir) {
    if (!arena || !module || !source_dir) return NULL;
    const char *relative_dir = source_dir;
    if (module->root[0]) {
        size_t root_len = strlen(module->root);
        if (strcmp(source_dir, module->root) == 0) {
            relative_dir = "";
        } else if (strncmp(source_dir, module->root, root_len) == 0 && source_dir[root_len] == '/') {
            relative_dir = source_dir + root_len + 1;
        } else {
            return NULL;
        }
    }
    if (!relative_dir[0]) return module->module_path;
    return cbm_arena_sprintf(arena, "%s/%s", module->module_path, relative_dir);
}

static const char *go_compute_local_package_qn(CBMArena *arena, const char *source_dir) {
    if (!arena || !source_dir) return NULL;
    if (!source_dir[0]) return "@local/.";
    return cbm_arena_sprintf(arena, "@local/%s", source_dir);
}

static bool go_string_in_table(const char *value, const char *const *table) {
    if (!value) return false;
    for (const char *const *item = table; *item; item++) {
        if (strcmp(value, *item) == 0) return true;
    }
    return false;
}

static bool go_filename_has_build_constraint(const char *path) {
    static const char *const goos[] = {
        "aix", "android", "darwin", "dragonfly", "freebsd", "illumos", "ios",
        "js", "linux", "netbsd", "openbsd", "plan9", "solaris", "wasip1", "windows", NULL
    };
    static const char *const goarch[] = {
        "386", "amd64", "arm", "arm64", "loong64", "mips", "mips64", "mips64le",
        "mipsle", "ppc64", "ppc64le", "riscv64", "s390x", "wasm", NULL
    };
    if (!path) return false;
    const char *base = strrchr(path, '/');
    base = base ? base + 1 : path;
    size_t len = strlen(base);
    if (len <= 3 || strcmp(base + len - 3, ".go") != 0) return false;

    size_t stem_len = len - 3;
    const char *last_us = NULL;
    for (size_t i = 0; i < stem_len; i++) {
        if (base[i] == '_') last_us = base + i;
    }
    if (!last_us || last_us + 1 >= base + stem_len) return false;
    size_t token_len = (size_t)((base + stem_len) - (last_us + 1));
    char token[32];
    if (token_len == 0 || token_len >= sizeof(token)) return false;
    memcpy(token, last_us + 1, token_len);
    token[token_len] = '\0';
    return go_string_in_table(token, goos) || go_string_in_table(token, goarch);
}

static bool go_has_explicit_build_constraint(const char *source) {
    if (!source) return false;
    const char *p = source;
    while (*p) {
        const char *line_end = strchr(p, '\n');
        if (!line_end) line_end = p + strlen(p);
        const char *q = p;
        while (q < line_end && (*q == ' ' || *q == '\t' || *q == '\r')) q++;
        size_t remaining = (size_t)(line_end - q);
        if (remaining >= 10 && strncmp(q, "//go:build", 10) == 0 &&
            (remaining == 10 || q[10] == ' ' || q[10] == '\t')) {
            return true;
        }
        if (remaining >= 9 && strncmp(q, "// +build", 9) == 0 &&
            (remaining == 9 || q[9] == ' ' || q[9] == '\t')) {
            return true;
        }
        if (remaining >= 7 && strncmp(q, "package", 7) == 0 &&
            (remaining == 7 || q[7] == ' ' || q[7] == '\t')) {
            return false;
        }
        p = *line_end ? line_end + 1 : line_end;
    }
    return false;
}

static bool go_import_spec_is_c(TSNode spec, const char *source) {
    if (ts_node_is_null(spec) || !source || strcmp(ts_node_type(spec), "import_spec") != 0) return false;
    TSNode path_node = ts_node_child_by_field_name(spec, "path", 4);
    if (ts_node_is_null(path_node)) return false;
    uint32_t start = ts_node_start_byte(path_node);
    uint32_t end = ts_node_end_byte(path_node);
    if (end <= start + 1) return false;
    char first = source[start];
    char last = source[end - 1];
    return (first == '"' || first == '`') && last == first && end - start == 3 && source[start + 1] == 'C';
}

static bool go_ast_imports_c(TSNode root, const char *source) {
    if (ts_node_is_null(root) || !source) return false;
    uint32_t count = ts_node_named_child_count(root);
    for (uint32_t i = 0; i < count; i++) {
        TSNode child = ts_node_named_child(root, i);
        if (ts_node_is_null(child) || strcmp(ts_node_type(child), "import_declaration") != 0) continue;
        uint32_t ic = ts_node_named_child_count(child);
        for (uint32_t j = 0; j < ic; j++) {
            TSNode spec = ts_node_named_child(child, j);
            if (ts_node_is_null(spec)) continue;
            if (go_import_spec_is_c(spec, source)) return true;
            if (strcmp(ts_node_type(spec), "import_spec_list") == 0) {
                uint32_t sc = ts_node_named_child_count(spec);
                for (uint32_t k = 0; k < sc; k++) {
                    if (go_import_spec_is_c(ts_node_named_child(spec, k), source)) return true;
                }
            }
        }
    }
    return false;
}

static bool go_nullable_string_equal(const char *a, const char *b) {
    if (!a || !b) return a == b;
    return strcmp(a, b) == 0;
}

static int go_build_package_table(const SatoriGoSourceMeta *meta, uint32_t source_count,
                                  SatoriGoPackageTable *packages, SatoriGoSourceMeta *mutable_meta) {
    memset(packages, 0, sizeof(*packages));
    if (source_count == 0) return SATORI_SEMANTIC_OK;
    packages->items = (SatoriGoPackage *)calloc(source_count, sizeof(SatoriGoPackage));
    if (!packages->items) return SATORI_SEMANTIC_ERR_OUT_OF_MEMORY;

    for (uint32_t i = 0; i < source_count; i++) {
        mutable_meta[i].package_index = UINT32_MAX;
        if (!meta[i].calls_eligible) continue;
        uint32_t found = UINT32_MAX;
        for (uint32_t j = 0; j < packages->count; j++) {
            SatoriGoPackage *pkg = &packages->items[j];
            if (strcmp(pkg->source_dir, meta[i].source_dir) != 0 ||
                !go_nullable_string_equal(pkg->module_root, meta[i].module ? meta[i].module->root : NULL) ||
                !go_nullable_string_equal(pkg->module_path, meta[i].module ? meta[i].module->module_path : NULL) ||
                !go_nullable_string_equal(pkg->import_path, meta[i].import_path) ||
                strcmp(pkg->declared_package_name, meta[i].declared_package_name) != 0) {
                continue;
            }
            found = j;
            break;
        }
        if (found == UINT32_MAX) {
            found = packages->count++;
            SatoriGoPackage *pkg = &packages->items[found];
            pkg->module_root = meta[i].module ? meta[i].module->root : NULL;
            pkg->module_path = meta[i].module ? meta[i].module->module_path : NULL;
            pkg->source_dir = meta[i].source_dir;
            pkg->import_path = meta[i].import_path;
            pkg->package_qn = meta[i].package_qn;
            pkg->declared_package_name = meta[i].declared_package_name;
        }
        mutable_meta[i].package_index = found;
    }

    for (uint32_t i = 0; i < packages->count; i++) {
        for (uint32_t j = i + 1; j < packages->count; j++) {
            SatoriGoPackage *a = &packages->items[i];
            SatoriGoPackage *b = &packages->items[j];
            bool same_source_identity = strcmp(a->source_dir, b->source_dir) == 0 &&
                go_nullable_string_equal(a->module_root, b->module_root) &&
                go_nullable_string_equal(a->import_path, b->import_path);
            bool same_import_path = a->import_path && b->import_path && strcmp(a->import_path, b->import_path) == 0;
            if (same_source_identity || same_import_path) {
                a->ambiguous = true;
                b->ambiguous = true;
            }
        }
    }

    for (uint32_t i = 0; i < source_count; i++) {
        uint32_t package_index = mutable_meta[i].package_index;
        if (package_index != UINT32_MAX && packages->items[package_index].ambiguous) {
            mutable_meta[i].calls_eligible = false;
        }
    }
    return SATORI_SEMANTIC_OK;
}

static SatoriGoPackageLookupState go_find_package_by_import_path(const SatoriGoPackageTable *packages,
                                                                  const char *import_path,
                                                                  const SatoriGoPackage **out) {
    if (out) *out = NULL;
    if (!packages || !import_path) return SATORI_GO_PACKAGE_LOOKUP_NONE;
    const SatoriGoPackage *match = NULL;
    for (uint32_t i = 0; i < packages->count; i++) {
        const SatoriGoPackage *pkg = &packages->items[i];
        if (!pkg->import_path || strcmp(pkg->import_path, import_path) != 0) continue;
        if (pkg->ambiguous || match) return SATORI_GO_PACKAGE_LOOKUP_AMBIGUOUS;
        match = pkg;
    }
    if (!match) return SATORI_GO_PACKAGE_LOOKUP_NONE;
    if (out) *out = match;
    return SATORI_GO_PACKAGE_LOOKUP_UNIQUE;
}

static int extract_package_name(CBMArena *arena, TSNode root, const char *source, const char **out_name) {
    if (!arena || !source || !out_name) return SATORI_SEMANTIC_ERR_INVALID_ARGUMENT;
    *out_name = "main";
    if (ts_node_is_null(root)) return SATORI_SEMANTIC_OK;
    uint32_t count = ts_node_named_child_count(root);
    for (uint32_t i = 0; i < count; i++) {
        TSNode child = ts_node_named_child(root, i);
        if (ts_node_is_null(child) || strcmp(ts_node_type(child), "package_clause") != 0) continue;
        uint32_t pc_count = ts_node_named_child_count(child);
        for (uint32_t j = 0; j < pc_count; j++) {
            TSNode id_node = ts_node_named_child(child, j);
            if (ts_node_is_null(id_node)) continue;
            uint32_t start = ts_node_start_byte(id_node);
            uint32_t end = ts_node_end_byte(id_node);
            if (end <= start) continue;
            const char *name = cbm_arena_strndup(arena, source + start, end - start);
            if (!name) return SATORI_SEMANTIC_ERR_OUT_OF_MEMORY;
            if (name[0]) {
                *out_name = name;
                return SATORI_SEMANTIC_OK;
            }
        }
    }
    return SATORI_SEMANTIC_OK;
}

static int extract_ast_import_spec(GoLSPContext *ctx, TSNode spec, const char *source,
                                   const SatoriGoPackageTable *packages) {
    if (ts_node_is_null(spec) || strcmp(ts_node_type(spec), "import_spec") != 0) return SATORI_SEMANTIC_OK;
    TSNode path_node = ts_node_child_by_field_name(spec, "path", 4);
    TSNode name_node = ts_node_child_by_field_name(spec, "name", 4);
    if (ts_node_is_null(path_node)) return SATORI_SEMANTIC_OK;

    uint32_t start = ts_node_start_byte(path_node);
    uint32_t end = ts_node_end_byte(path_node);
    if (end <= start + 1) return SATORI_SEMANTIC_OK;
    char quote = source[start];
    if ((quote != '"' && quote != '`') || source[end - 1] != quote) return SATORI_SEMANTIC_OK;
    const char *import_path = cbm_arena_strndup(ctx->arena, source + start + 1, end - start - 2);
    if (!import_path) return SATORI_SEMANTIC_ERR_OUT_OF_MEMORY;

    const SatoriGoPackage *target_package = NULL;
    SatoriGoPackageLookupState lookup = go_find_package_by_import_path(packages, import_path, &target_package);
    if (lookup == SATORI_GO_PACKAGE_LOOKUP_AMBIGUOUS) return SATORI_SEMANTIC_OK;

    const char *local_name = NULL;
    if (!ts_node_is_null(name_node)) {
        uint32_t name_start = ts_node_start_byte(name_node);
        uint32_t name_end = ts_node_end_byte(name_node);
        if (name_end > name_start) {
            local_name = cbm_arena_strndup(ctx->arena, source + name_start, name_end - name_start);
            if (!local_name) return SATORI_SEMANTIC_ERR_OUT_OF_MEMORY;
        }
    }
    if (!local_name || !local_name[0]) {
        if (lookup == SATORI_GO_PACKAGE_LOOKUP_UNIQUE) {
            local_name = target_package->declared_package_name;
        } else {
            const char *last_slash = strrchr(import_path, '/');
            local_name = last_slash ? last_slash + 1 : import_path;
        }
    }

    const char *package_qn = lookup == SATORI_GO_PACKAGE_LOOKUP_UNIQUE
        ? target_package->package_qn
        : import_path;
    if (!go_lsp_add_import(ctx, local_name, package_qn)) return SATORI_SEMANTIC_ERR_OUT_OF_MEMORY;
    return SATORI_SEMANTIC_OK;
}

static int extract_ast_imports(GoLSPContext *ctx, TSNode root, const char *source,
                               const SatoriGoPackageTable *packages) {
    if (ts_node_is_null(root) || !source) return SATORI_SEMANTIC_OK;
    uint32_t count = ts_node_named_child_count(root);
    for (uint32_t i = 0; i < count; i++) {
        TSNode child = ts_node_named_child(root, i);
        if (ts_node_is_null(child) || strcmp(ts_node_type(child), "import_declaration") != 0) continue;
        uint32_t ic = ts_node_named_child_count(child);
        for (uint32_t j = 0; j < ic; j++) {
            TSNode spec = ts_node_named_child(child, j);
            if (ts_node_is_null(spec)) continue;
            const char *stype = ts_node_type(spec);
            if (strcmp(stype, "import_spec_list") == 0) {
                uint32_t sc = ts_node_named_child_count(spec);
                for (uint32_t k = 0; k < sc; k++) {
                    int status = extract_ast_import_spec(ctx, ts_node_named_child(spec, k), source, packages);
                    if (status != SATORI_SEMANTIC_OK) return status;
                }
            } else if (strcmp(stype, "import_spec") == 0) {
                int status = extract_ast_import_spec(ctx, spec, source, packages);
                if (status != SATORI_SEMANTIC_OK) return status;
            }
        }
    }
    return SATORI_SEMANTIC_OK;
}

static int extract_ast_definitions(CBMArena *arena, CBMTypeRegistry *reg, SatoriDefLocArray *def_locs,
                                   TSNode root, const char *source, const char *pkg_name,
                                   const char *import_path, const char *file_path, uint32_t file_path_len) {
    if (ts_node_is_null(root) || !source || !pkg_name) return SATORI_SEMANTIC_OK;
    uint32_t kn = 0;
    TSNode *kids = cbm_lsp_collect_children(arena, root, &kn);
    if (kn > 0 && !kids) return SATORI_SEMANTIC_ERR_OUT_OF_MEMORY;
    for (uint32_t i = 0; i < kn; i++) {
        TSNode child = kids[i];
        if (ts_node_is_null(child) || !ts_node_is_named(child)) continue;
        const char *kind = ts_node_type(child);

        if (strcmp(kind, "function_declaration") == 0) {
            TSNode name_node = ts_node_child_by_field_name(child, "name", 4);
            if (ts_node_is_null(name_node)) continue;
            char *fn_name = cbm_node_text(arena, name_node, source);
            if (!fn_name) return SATORI_SEMANTIC_ERR_OUT_OF_MEMORY;
            if (!fn_name[0]) continue;

            CBMRegisteredFunc rf;
            memset(&rf, 0, sizeof(rf));
            rf.qualified_name = cbm_arena_sprintf(arena, "%s.%s", pkg_name, fn_name);
            if (!rf.qualified_name) return SATORI_SEMANTIC_ERR_OUT_OF_MEMORY;
            rf.short_name = fn_name;
            cbm_registry_add_func(reg, rf);
            int add_status = def_locs_add(def_locs, rf.qualified_name, file_path, file_path_len,
                                          ts_node_start_byte(child), ts_node_end_byte(child),
                                          pkg_name, import_path);
            if (add_status != SATORI_SEMANTIC_OK) return add_status;
        } else if (strcmp(kind, "method_declaration") == 0) {
            TSNode name_node = ts_node_child_by_field_name(child, "name", 4);
            TSNode recv_node = ts_node_child_by_field_name(child, "receiver", 8);
            if (ts_node_is_null(name_node) || ts_node_is_null(recv_node)) continue;

            char *method_name = cbm_node_text(arena, name_node, source);
            if (!method_name) return SATORI_SEMANTIC_ERR_OUT_OF_MEMORY;
            if (!method_name[0]) continue;

            char *recv_name = NULL;
            uint32_t rnc = ts_node_child_count(recv_node);
            for (uint32_t r = 0; r < rnc && !recv_name; r++) {
                TSNode rp = ts_node_child(recv_node, r);
                if (ts_node_is_null(rp) || !ts_node_is_named(rp)) continue;
                if (strcmp(ts_node_type(rp), "parameter_declaration") != 0) continue;
                TSNode rtype = ts_node_child_by_field_name(rp, "type", 4);
                if (ts_node_is_null(rtype)) continue;
                const char *rtk = ts_node_type(rtype);
                if (strcmp(rtk, "pointer_type") == 0 && ts_node_named_child_count(rtype) > 0) {
                    rtype = ts_node_named_child(rtype, 0);
                }
                char *tn = cbm_node_text(arena, rtype, source);
                if (!tn) return SATORI_SEMANTIC_ERR_OUT_OF_MEMORY;
                if (tn[0]) recv_name = tn;
            }
            if (recv_name) {
                CBMRegisteredFunc rf;
                memset(&rf, 0, sizeof(rf));
                rf.receiver_type = cbm_arena_sprintf(arena, "%s.%s", pkg_name, recv_name);
                rf.qualified_name = cbm_arena_sprintf(arena, "%s.%s.%s", pkg_name, recv_name, method_name);
                if (!rf.receiver_type || !rf.qualified_name) return SATORI_SEMANTIC_ERR_OUT_OF_MEMORY;
                rf.short_name = method_name;
                cbm_registry_add_func(reg, rf);
                int add_status = def_locs_add(def_locs, rf.qualified_name, file_path, file_path_len,
                                              ts_node_start_byte(child), ts_node_end_byte(child),
                                              pkg_name, import_path);
                if (add_status != SATORI_SEMANTIC_OK) return add_status;
            }
        } else if (strcmp(kind, "type_declaration") == 0) {
            uint32_t td_nc = ts_node_child_count(child);
            for (uint32_t t = 0; t < td_nc; t++) {
                TSNode spec = ts_node_child(child, t);
                if (ts_node_is_null(spec) || !ts_node_is_named(spec)) continue;
                if (strcmp(ts_node_type(spec), "type_spec") != 0) continue;
                TSNode tname = ts_node_child_by_field_name(spec, "name", 4);
                if (ts_node_is_null(tname)) continue;
                char *type_name = cbm_node_text(arena, tname, source);
                if (!type_name) return SATORI_SEMANTIC_ERR_OUT_OF_MEMORY;
                if (!type_name[0]) continue;

                CBMRegisteredType rt;
                memset(&rt, 0, sizeof(rt));
                rt.qualified_name = cbm_arena_sprintf(arena, "%s.%s", pkg_name, type_name);
                if (!rt.qualified_name) return SATORI_SEMANTIC_ERR_OUT_OF_MEMORY;
                rt.short_name = type_name;
                cbm_registry_add_type(reg, rt);
                int add_status = def_locs_add(def_locs, rt.qualified_name, file_path, file_path_len,
                                              ts_node_start_byte(child), ts_node_end_byte(child),
                                              pkg_name, import_path);
                if (add_status != SATORI_SEMANTIC_OK) return add_status;
            }
        }
    }
    return SATORI_SEMANTIC_OK;
}

int satori_semantic_resolve(SatoriSemanticHandle handle) {
    SatoriSession *s = find_session(handle);
    if (!s) {
        set_global_error("Handle not found in resolve");
        return SATORI_SEMANTIC_ERR_HANDLE_NOT_FOUND;
    }

    /* Reset previous results and string table */
    free(s->results);
    s->results = NULL;
    s->result_count = 0;
    s->result_cap = 0;

    free(s->str_table.data);
    s->str_table.data = NULL;
    s->str_table.len = 0;
    s->str_table.cap = 0;

    cbm_arena_destroy(&s->arena);
    cbm_arena_init(&s->arena);

    if (s->source_count == 0) {
        return SATORI_SEMANTIC_OK;
    }

    int status = SATORI_SEMANTIC_OK;
    TSTree **trees = NULL;
    TSParser *parser = NULL;
    SatoriGoSourceMeta *source_meta = NULL;
    SatoriGoModuleTable modules;
    SatoriGoPackageTable packages;
    SatoriDefLocArray def_locs;
    memset(&modules, 0, sizeof(modules));
    memset(&packages, 0, sizeof(packages));
    memset(&def_locs, 0, sizeof(def_locs));
    uint64_t total_call_sites = 0;

    CBMTypeRegistry reg;
    cbm_registry_init(&reg, &s->arena);
    cbm_go_stdlib_register(&reg, &s->arena);

    parser = ts_parser_new();
    if (!parser) {
        set_session_error(s, "Failed to create Tree-sitter parser");
        status = SATORI_SEMANTIC_ERR_PARSE_FAILED;
        goto cleanup;
    }
    ts_parser_set_language(parser, tree_sitter_go());

    trees = (TSTree **)calloc(s->source_count, sizeof(TSTree *));
    source_meta = (SatoriGoSourceMeta *)calloc(s->source_count, sizeof(SatoriGoSourceMeta));
    if (!trees || !source_meta) {
        set_session_error(s, "Out of memory allocating Go semantic project state");
        status = SATORI_SEMANTIC_ERR_OUT_OF_MEMORY;
        goto cleanup;
    }

    status = go_build_module_table(&s->arena, s->auxiliaries, s->aux_count, &modules);
    if (status != SATORI_SEMANTIC_OK) {
        if (status == SATORI_SEMANTIC_ERR_OUT_OF_MEMORY) {
            set_session_error(s, "Out of memory building Go module table");
        } else {
            set_session_error(s, "Malformed or conflicting Go module metadata");
        }
        goto cleanup;
    }

    // Phase 1: Parse sources and establish deterministic module/package/build identity.
    for (uint32_t i = 0; i < s->source_count; i++) {
        SatoriSourceFile *sf = &s->sources[i];
        trees[i] = ts_parser_parse_string(parser, NULL, sf->source, sf->source_len);
        if (!trees[i]) {
            set_session_error(s, "Tree-sitter parser failed to parse source file");
            status = SATORI_SEMANTIC_ERR_PARSE_FAILED;
            goto cleanup;
        }

        SatoriGoSourceMeta *meta = &source_meta[i];
        meta->normalized_path = go_normalize_relative_path(&s->arena, sf->path);
        if (!meta->normalized_path) {
            set_session_error(s, "Out of memory normalizing Go source path");
            status = SATORI_SEMANTIC_ERR_OUT_OF_MEMORY;
            goto cleanup;
        }
        meta->source_dir = go_dirname(&s->arena, meta->normalized_path);
        if (!meta->source_dir) {
            set_session_error(s, "Out of memory deriving Go source directory");
            status = SATORI_SEMANTIC_ERR_OUT_OF_MEMORY;
            goto cleanup;
        }
        meta->module = go_find_nearest_module(&modules, meta->normalized_path);

        TSNode root = ts_tree_root_node(trees[i]);
        status = extract_package_name(&s->arena, root, sf->source, &meta->declared_package_name);
        if (status != SATORI_SEMANTIC_OK) {
            set_session_error(s, "Out of memory extracting Go package name");
            goto cleanup;
        }

        if (meta->module) {
            meta->import_path = go_compute_import_path(&s->arena, meta->module, meta->source_dir);
            meta->package_qn = meta->import_path;
        } else {
            meta->import_path = NULL;
            meta->package_qn = go_compute_local_package_qn(&s->arena, meta->source_dir);
        }
        if (!meta->package_qn) {
            set_session_error(s, "Out of memory computing Go package identity");
            status = SATORI_SEMANTIC_ERR_OUT_OF_MEMORY;
            goto cleanup;
        }

        size_t normalized_len = strlen(meta->normalized_path);
        bool is_test_file = normalized_len >= 8 &&
            strcmp(meta->normalized_path + normalized_len - 8, "_test.go") == 0;
        meta->calls_eligible = !is_test_file &&
            !go_filename_has_build_constraint(meta->normalized_path) &&
            !go_has_explicit_build_constraint(sf->source) &&
            !go_ast_imports_c(root, sf->source);
    }

    status = go_build_package_table(source_meta, s->source_count, &packages, source_meta);
    if (status != SATORI_SEMANTIC_OK) {
        set_session_error(s, "Out of memory building Go package table");
        goto cleanup;
    }

    // Phase 2: Register definitions only from files whose build/package identity is authoritative.
    for (uint32_t i = 0; i < s->source_count; i++) {
        if (!source_meta[i].calls_eligible) continue;
        SatoriSourceFile *sf = &s->sources[i];
        TSNode root = ts_tree_root_node(trees[i]);
        status = extract_ast_definitions(&s->arena, &reg, &def_locs, root, sf->source,
                                         source_meta[i].package_qn, source_meta[i].import_path,
                                         sf->path, sf->path_len);
        if (status != SATORI_SEMANTIC_OK) {
            if (status == SATORI_SEMANTIC_ERR_RESOURCE_LIMIT_EXCEEDED) {
                set_session_error(s, "Resource limit exceeded: max definitions exceeded");
            } else {
                set_session_error(s, "Out of memory recording AST definitions");
            }
            goto cleanup;
        }
    }

    cbm_registry_finalize(&reg);

    // Phase 3: Resolve calls only from authoritative files against the authoritative registry.
    for (uint32_t i = 0; i < s->source_count; i++) {
        if (!trees[i]) continue;
        if (!source_meta[i].calls_eligible) {
            ts_tree_delete(trees[i]);
            trees[i] = NULL;
            continue;
        }

        SatoriSourceFile *sf = &s->sources[i];
        TSNode root = ts_tree_root_node(trees[i]);
        CBMResolvedCallArray resolved_calls;
        memset(&resolved_calls, 0, sizeof(resolved_calls));

        GoLSPContext ctx;
        go_lsp_init(&ctx, &s->arena, sf->source, sf->source_len, &reg,
                    source_meta[i].package_qn, &resolved_calls);
        status = extract_ast_imports(&ctx, root, sf->source, &packages);
        if (status != SATORI_SEMANTIC_OK) {
            set_session_error(s, "Out of memory extracting Go imports");
            goto cleanup;
        }
        go_lsp_process_file(&ctx, root);

        ts_tree_delete(trees[i]);
        trees[i] = NULL;

        if (resolved_calls.count < 0 ||
            (uint64_t)resolved_calls.count > SATORI_MAX_CALL_SITES - total_call_sites) {
            set_session_error(s, "Resource limit exceeded: max call sites exceeded");
            status = SATORI_SEMANTIC_ERR_RESOURCE_LIMIT_EXCEEDED;
            goto cleanup;
        }
        total_call_sites += (uint64_t)resolved_calls.count;

        if (resolved_calls.count > 0) {
            if ((uint32_t)resolved_calls.count > SATORI_MAX_RESULTS - s->result_count) {
                set_session_error(s, "Resource limit exceeded: max results exceeded");
                status = SATORI_SEMANTIC_ERR_RESOURCE_LIMIT_EXCEEDED;
                goto cleanup;
            }
            uint32_t needed = s->result_count + (uint32_t)resolved_calls.count;

            if (needed > s->result_cap) {
                uint32_t new_cap = s->result_cap == 0 ? 64 : s->result_cap * 2;
                if (new_cap > SATORI_MAX_RESULTS) new_cap = SATORI_MAX_RESULTS;
                while (new_cap < needed && new_cap < SATORI_MAX_RESULTS) {
                    uint32_t doubled = new_cap * 2;
                    new_cap = doubled > SATORI_MAX_RESULTS ? SATORI_MAX_RESULTS : doubled;
                }
                SatoriSemanticResultV1 *new_res = (SatoriSemanticResultV1 *)realloc(
                    s->results, new_cap * sizeof(SatoriSemanticResultV1));
                if (!new_res) {
                    set_session_error(s, "Out of memory allocating results");
                    status = SATORI_SEMANTIC_ERR_OUT_OF_MEMORY;
                    goto cleanup;
                }
                s->results = new_res;
                s->result_cap = new_cap;
            }

            uint32_t src_path_len = 0;
            uint32_t src_path_off = 0;
            if (!str_table_intern_checked(&s->str_table, sf->path, sf->path_len, &src_path_off, &src_path_len)) {
                set_session_error(s, "String table resource limit exceeded");
                status = SATORI_SEMANTIC_ERR_RESOURCE_LIMIT_EXCEEDED;
                goto cleanup;
            }

            for (int r = 0; r < resolved_calls.count; r++) {
                CBMResolvedCall *rc = &resolved_calls.items[r];
                if (rc->confidence == 0.0f || (rc->strategy && strcmp(rc->strategy, "lsp_unresolved") == 0)) {
                    continue;
                }

                SatoriSemanticResultV1 *dst = &s->results[s->result_count++];
                memset(dst, 0, sizeof(SatoriSemanticResultV1));

                dst->source_file_offset = src_path_off;
                dst->source_file_length = src_path_len;
                dst->call_start_byte = rc->site_start_byte;
                dst->call_end_byte = rc->site_end_byte;

                const SatoriDefLoc *dl = NULL;
                SatoriDefLookupState lookup = rc->callee_qn
                    ? def_locs_find_unique(&def_locs, rc->callee_qn, &dl)
                    : SATORI_DEF_LOOKUP_NONE;
                if (lookup == SATORI_DEF_LOOKUP_UNIQUE) {
                    const char *target_name = rc->callee_qn;
                    const char *last_dot = strrchr(rc->callee_qn, '.');
                    if (last_dot) target_name = last_dot + 1;
                    uint32_t target_len = (uint32_t)strlen(target_name);
                    if (!str_table_intern_checked(&s->str_table, target_name, target_len,
                                                  &dst->target_name_offset, &dst->target_name_length) ||
                        !str_table_intern_checked(&s->str_table, dl->file_path, dl->file_path_len,
                                                  &dst->target_file_offset, &dst->target_file_length)) {
                        set_session_error(s, "String table resource limit exceeded");
                        status = SATORI_SEMANTIC_ERR_RESOURCE_LIMIT_EXCEEDED;
                        goto cleanup;
                    }
                    if (dl->import_path && strcmp(dl->package_qn, source_meta[i].package_qn) != 0) {
                        uint32_t import_len = (uint32_t)strlen(dl->import_path);
                        if (!str_table_intern_checked(&s->str_table, dl->import_path, import_len,
                                                      &dst->import_path_offset, &dst->import_path_length)) {
                            set_session_error(s, "String table resource limit exceeded");
                            status = SATORI_SEMANTIC_ERR_RESOURCE_LIMIT_EXCEEDED;
                            goto cleanup;
                        }
                    }
                    dst->target_start_byte = dl->start_byte;
                    dst->target_end_byte = dl->end_byte;
                    dst->decision = (uint8_t)SATORI_DECISION_RESOLVED;
                } else if (lookup == SATORI_DEF_LOOKUP_AMBIGUOUS) {
                    dst->decision = (uint8_t)SATORI_DECISION_AMBIGUOUS;
                } else {
                    dst->decision = (uint8_t)SATORI_DECISION_UNRESOLVED;
                }

                dst->strategy = map_strategy(rc->strategy);
                dst->confidence = rc->confidence > 0.0f ? rc->confidence : 0.95f;
                if (dst->strategy == SATORI_STRATEGY_TYPE_DISPATCH ||
                    dst->strategy == SATORI_STRATEGY_EMBED_DISPATCH ||
                    dst->strategy == SATORI_STRATEGY_INTERFACE_DISPATCH) {
                    dst->target_kind = (uint8_t)SATORI_TARGET_METHOD;
                    if (rc->callee_qn && dl && dl->package_qn) {
                        size_t package_len = strlen(dl->package_qn);
                        if (strncmp(rc->callee_qn, dl->package_qn, package_len) == 0 &&
                            rc->callee_qn[package_len] == '.') {
                            const char *receiver_start = rc->callee_qn + package_len + 1;
                            const char *last_dot = strrchr(receiver_start, '.');
                            if (last_dot && last_dot > receiver_start) {
                                uint32_t rlen = (uint32_t)(last_dot - receiver_start);
                                char recv_buf[128];
                                if (rlen < sizeof(recv_buf)) {
                                    memcpy(recv_buf, receiver_start, rlen);
                                    recv_buf[rlen] = '\0';
                                    if (!str_table_intern_checked(&s->str_table, recv_buf, rlen,
                                                                  &dst->receiver_type_offset,
                                                                  &dst->receiver_type_length)) {
                                        set_session_error(s, "String table resource limit exceeded");
                                        status = SATORI_SEMANTIC_ERR_RESOURCE_LIMIT_EXCEEDED;
                                        goto cleanup;
                                    }
                                    dst->receiver_binding_kind = (uint8_t)SATORI_BINDING_NONE;
                                }
                            }
                        }
                    }
                } else {
                    dst->target_kind = (uint8_t)SATORI_TARGET_FUNCTION;
                }
            }
        }
    }

cleanup:
    if (trees) {
        for (uint32_t i = 0; i < s->source_count; i++) {
            if (trees[i]) {
                ts_tree_delete(trees[i]);
                trees[i] = NULL;
            }
        }
        free(trees);
    }
    free(source_meta);
    free(modules.items);
    free(packages.items);
    free(def_locs.items);
    if (parser) {
        ts_parser_delete(parser);
    }
    return status;
}

uint32_t satori_semantic_result_count(SatoriSemanticHandle handle) {
    SatoriSession *s = find_session(handle);
    if (!s) return 0;
    return s->result_count;
}

const SatoriSemanticResultV1 *satori_semantic_results(SatoriSemanticHandle handle) {
    SatoriSession *s = find_session(handle);
    if (!s) return NULL;
    return s->results;
}

uint32_t satori_semantic_relationship_count(SatoriSemanticHandle handle) {
    return satori_semantic_result_count(handle);
}

const SatoriSemanticResultV1 *satori_semantic_relationships(SatoriSemanticHandle handle) {
    return satori_semantic_results(handle);
}

uint32_t satori_semantic_definition_count(SatoriSemanticHandle handle) {
    (void)handle;
    return 0; // Frozen multi-stream ABI contract (returns 0 in milestone 1)
}

const SatoriSemanticDefinitionV1 *satori_semantic_definitions(SatoriSemanticHandle handle) {
    (void)handle;
    return NULL;
}

uint32_t satori_semantic_diagnostic_count(SatoriSemanticHandle handle) {
    (void)handle;
    return 0; // Frozen multi-stream ABI contract (returns 0 in milestone 1)
}

const SatoriSemanticDiagnosticV1 *satori_semantic_diagnostics(SatoriSemanticHandle handle) {
    (void)handle;
    return NULL;
}

const char *satori_semantic_string_table(SatoriSemanticHandle handle, uint32_t *out_table_len) {
    SatoriSession *s = find_session(handle);
    if (!s) {
        if (out_table_len) *out_table_len = 0;
        return NULL;
    }
    if (out_table_len) *out_table_len = s->str_table.len;
    return s->str_table.data ? s->str_table.data : "";
}

void satori_semantic_destroy(SatoriSemanticHandle handle) {
    SatoriSession *s = find_session(handle);
    if (!s) return;

    for (uint32_t i = 0; i < s->source_count; i++) {
        free(s->sources[i].path);
        free(s->sources[i].source);
    }
    free(s->sources);

    for (uint32_t i = 0; i < s->aux_count; i++) {
        free(s->auxiliaries[i].role);
        free(s->auxiliaries[i].path);
        free(s->auxiliaries[i].source);
    }
    free(s->auxiliaries);

    free(s->results);
    free(s->str_table.data);
    cbm_arena_destroy(&s->arena);

    memset(s, 0, sizeof(SatoriSession));
    s->active = false;
}

void satori_semantic_free(SatoriSemanticHandle handle) {
    satori_semantic_destroy(handle);
}

int satori_semantic_go_smoke(void) {
    SatoriSemanticHandle h = 0;
    int rc = satori_semantic_create("go", 2, &h);
    if (rc != SATORI_SEMANTIC_OK) return rc;

    const char *go_src = "package main\n\nfunc hello() {}\nfunc main() {\n    hello()\n}\n";
    rc = satori_semantic_add_source(h, "main.go", 7, go_src, (uint32_t)strlen(go_src));
    if (rc != SATORI_SEMANTIC_OK) {
        satori_semantic_destroy(h);
        return rc;
    }

    rc = satori_semantic_resolve(h);
    if (rc != SATORI_SEMANTIC_OK) {
        satori_semantic_destroy(h);
        return rc;
    }

    uint32_t count = satori_semantic_relationship_count(h);
    (void)count;
    satori_semantic_destroy(h);
    return 0;
}
