#ifndef SATORI_HELPERS_MINIMAL_H
#define SATORI_HELPERS_MINIMAL_H

#include "cbm.h"

static inline char *cbm_node_text(CBMArena *a, TSNode node, const char *source) {
    uint32_t start = ts_node_start_byte(node);
    uint32_t end = ts_node_end_byte(node);
    if (end <= start) {
        return cbm_arena_strdup(a, "");
    }
    return cbm_arena_strndup(a, source + start, end - start);
}

static inline bool cbm_is_keyword(const char *name, CBMLanguage lang) {
    if (!name || !name[0]) return true;
    if (lang != CBM_LANG_RUST) return false;
    static const char *const rust_keywords[] = {
        "as", "async", "await", "break", "const", "continue", "crate", "dyn", "else",
        "enum", "extern", "false", "fn", "for", "if", "impl", "in", "let", "loop",
        "match", "mod", "move", "mut", "pub", "ref", "return", "self", "Self", "static",
        "struct", "super", "trait", "true", "type", "unsafe", "use", "where", "while",
        "abstract", "become", "box", "do", "final", "macro", "override", "priv", "try",
        "typeof", "unsized", "virtual", "yield", "Some", "None", "Ok", "Err", "Vec",
        "String", "Box", "Rc", "Arc", "Option", "Result", "println", "eprintln", "format",
        "write", "writeln", "print", "eprint", "panic", "assert", "assert_eq", "assert_ne",
        "debug_assert", "todo", "unimplemented", "cfg", "derive", "test", "allow", "deny",
        "warn", "forbid", "deprecated", NULL
    };
    for (const char *const *keyword = rust_keywords; *keyword; keyword++) {
        if (strcmp(name, *keyword) == 0) return true;
    }
    return false;
}

#endif /* SATORI_HELPERS_MINIMAL_H */
