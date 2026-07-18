import com.healthmarketscience.jackcess.Column;
import com.healthmarketscience.jackcess.Cursor;
import com.healthmarketscience.jackcess.CursorBuilder;
import com.healthmarketscience.jackcess.DataType;
import com.healthmarketscience.jackcess.Database;
import com.healthmarketscience.jackcess.DatabaseBuilder;
import com.healthmarketscience.jackcess.Table;
import org.json.JSONArray;
import org.json.JSONObject;

import java.io.InputStreamReader;
import java.io.Reader;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

/**
 * NavfitWriter — writes APEX evaluation rows into a copy of a NAVFIT 98A
 * template .accdb.
 *
 * Reads a JSON payload from stdin:
 * {
 *   "templatePath": "/path/to/template.accdb",
 *   "outputPath":   "/path/to/out.accdb",
 *   "clearReports": true,            // delete rows shipped inside the template
 *   "folders": [ { "FolderName": "...", ... } ],   // optional; FolderID auto-assigned
 *   "reports": [ { "Parent": "@folder:0", "ReportType": "Eval", ... } ]
 * }
 *
 * A report's "Parent" value "@folder:N" is replaced with "a <FolderID>" of the
 * Nth inserted folder (NAVFIT's folder-link encoding, e.g. "a 1"). Any other
 * Parent value is written verbatim.
 *
 * Prints a JSON result line to stdout: {"ok":true,"reportIds":[...],"folderIds":[...]}
 * On error: exit 1 with {"ok":false,"error":"..."} on stdout.
 */
public class NavfitWriter {

    public static void main(String[] args) {
        try {
            run();
        } catch (Exception e) {
            JSONObject err = new JSONObject();
            err.put("ok", false);
            err.put("error", String.valueOf(e.getMessage()));
            System.out.println(err);
            System.exit(1);
        }
    }

    private static void run() throws Exception {
        Reader in = new InputStreamReader(System.in, StandardCharsets.UTF_8);
        StringBuilder sb = new StringBuilder();
        char[] buf = new char[8192];
        int n;
        while ((n = in.read(buf)) != -1) sb.append(buf, 0, n);
        JSONObject payload = new JSONObject(sb.toString());

        Path template = Paths.get(payload.getString("templatePath"));
        Path output = Paths.get(payload.getString("outputPath"));
        Files.copy(template, output, StandardCopyOption.REPLACE_EXISTING);

        JSONArray folderIds = new JSONArray();
        JSONArray reportIds = new JSONArray();

        try (Database db = DatabaseBuilder.open(output.toFile())) {
            Table reports = db.getTable("Reports");
            Table folders = db.getTable("Folders");

            if (payload.optBoolean("clearReports", true)) {
                Cursor cursor = CursorBuilder.createCursor(reports);
                while (cursor.moveToNextRow()) cursor.deleteCurrentRow();
            }

            JSONArray folderRows = payload.optJSONArray("folders");
            long[] insertedFolderIds = new long[folderRows == null ? 0 : folderRows.length()];
            if (folderRows != null) {
                for (int i = 0; i < folderRows.length(); i++) {
                    Map<String, Object> row = folders.addRowFromMap(coerceRow(folders, folderRows.getJSONObject(i)));
                    insertedFolderIds[i] = ((Number) row.get("FolderID")).longValue();
                    folderIds.put(insertedFolderIds[i]);
                }
            }

            JSONArray reportRows = payload.getJSONArray("reports");
            for (int i = 0; i < reportRows.length(); i++) {
                JSONObject src = reportRows.getJSONObject(i);
                Object parent = src.opt("Parent");
                if (parent instanceof String && ((String) parent).startsWith("@folder:")) {
                    int idx = Integer.parseInt(((String) parent).substring("@folder:".length()));
                    src.put("Parent", "a " + insertedFolderIds[idx]);
                }
                Map<String, Object> row = reports.addRowFromMap(coerceRow(reports, src));
                reportIds.put(((Number) row.get("ReportID")).longValue());
            }
        }

        JSONObject ok = new JSONObject();
        ok.put("ok", true);
        ok.put("folderIds", folderIds);
        ok.put("reportIds", reportIds);
        System.out.println(ok);
    }

    /** Coerce JSON values to what Jackcess expects for each column's Access type. */
    private static Map<String, Object> coerceRow(Table table, JSONObject src) {
        Map<String, Object> row = new HashMap<>();
        for (String key : src.keySet()) {
            Column col = table.getColumn(key); // throws on unknown column — fail loud
            Object val = src.isNull(key) ? null : src.get(key);
            row.put(key, coerce(col, val, key));
        }
        return row;
    }

    private static Object coerce(Column col, Object val, String key) {
        if (val == null) return null;
        DataType t = col.getType();
        switch (t) {
            case SHORT_DATE_TIME:
            case EXT_DATE_TIME: {
                String s = val.toString();
                // ISO date or datetime from the Node side
                if (s.length() == 10) return LocalDate.parse(s).atStartOfDay();
                return LocalDateTime.parse(s);
            }
            case NUMERIC:
            case MONEY:
                return new BigDecimal(val.toString());
            case BOOLEAN:
                if (val instanceof Boolean) return val;
                throw new IllegalArgumentException(key + ": expected boolean, got " + val);
            case BYTE:
            case INT:
            case LONG:
            case FLOAT:
            case DOUBLE:
                if (val instanceof Number) return val;
                throw new IllegalArgumentException(key + ": expected number, got " + val);
            case TEXT:
            case MEMO: {
                String s = val.toString();
                int max = t == DataType.TEXT ? col.getLengthInUnits() : Integer.MAX_VALUE;
                if (s.length() > max)
                    throw new IllegalArgumentException(key + ": length " + s.length() + " exceeds " + max);
                return s;
            }
            default:
                return val;
        }
    }
}
