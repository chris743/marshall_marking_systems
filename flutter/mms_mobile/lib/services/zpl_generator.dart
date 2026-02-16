import '../models/product.dart';

/// Generate ZPL code from template elements with variable substitution
class ZplGenerator {
  static final List<String> _months = [
    'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
    'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'
  ];

  /// Generate ZPL from template elements
  static String generate({
    required List<dynamic> elements,
    required int labelWidth,
    required int labelHeight,
    Product? product,
    String? lotNumber,
    String? packDateFormat,
    int packDateOffset = 0,
    Map<String, dynamic> customVarValues = const {},
    int quantity = 1,
  }) {
    final buffer = StringBuffer();

    // ZPL header
    buffer.writeln('^XA');
    buffer.writeln('^PW$labelWidth');
    buffer.writeln('^LL$labelHeight');
    buffer.writeln('^CI28'); // UTF-8 encoding

    // Quantity
    if (quantity > 1) {
      buffer.writeln('^PQ$quantity,0,0,N');
    }

    // Generate voice pick code
    final voicePickCode = _generateVoicePickCode(
      product?.gtin ?? '',
      lotNumber ?? '',
      _formatDate(packDateFormat ?? 'YYMMDD', packDateOffset),
    );

    // Display pack date
    final packDate = _formatDate('MM/DD/YY', 0);

    // Process each element
    for (final el in elements) {
      if (el['visible'] == false) continue;

      final x = (el['x'] ?? 0).round();
      final y = (el['y'] ?? 0).round();
      final type = el['type'] ?? '';

      switch (type) {
        case 'text':
          final text = _replaceVariables(
            el['text'] ?? '',
            product: product,
            lotNumber: lotNumber,
            packDate: packDate,
            voicePickCode: voicePickCode,
            customVarValues: customVarValues,
            packDateFormat: packDateFormat,
            packDateOffset: packDateOffset,
          );
          final fontSize = el['fontSize'] ?? 24;
          buffer.writeln('^FO$x,$y');
          buffer.writeln('^A0N,$fontSize,$fontSize');
          buffer.writeln('^FD$text^FS');
          break;

        case 'barcode-gs1-128':
          final data = _replaceVariables(
            (el['data'] ?? '').replaceAll(RegExp(r'[()]'), ''),
            product: product,
            lotNumber: lotNumber,
            packDate: packDate,
            voicePickCode: voicePickCode,
            customVarValues: customVarValues,
            packDateFormat: packDateFormat,
            packDateOffset: packDateOffset,
          );
          final height = el['height'] ?? 80;
          final moduleWidth = el['moduleWidth'] ?? 3;
          final showText = el['showText'] == true ? 'Y' : 'N';
          buffer.writeln('^FO$x,$y');
          buffer.writeln('^BY$moduleWidth');
          buffer.writeln('^BCN,$height,$showText,N,N');
          buffer.writeln('^FD>;>8$data^FS');
          break;

        case 'barcode-upc':
          final data = _addBarcodeCheckDigit(
            _replaceVariables(
              el['data'] ?? '',
              product: product,
              lotNumber: lotNumber,
              packDate: packDate,
              voicePickCode: voicePickCode,
              customVarValues: customVarValues,
              packDateFormat: packDateFormat,
              packDateOffset: packDateOffset,
            ),
          );
          final height = el['height'] ?? 70;
          final showText = el['showText'] == true ? 'Y' : 'N';
          buffer.writeln('^FO$x,$y');
          buffer.writeln('^BUN,$height,$showText,N,Y');
          buffer.writeln('^FD$data^FS');
          break;

        case 'barcode-ean':
          final data = _addBarcodeCheckDigit(
            _replaceVariables(
              el['data'] ?? '',
              product: product,
              lotNumber: lotNumber,
              packDate: packDate,
              voicePickCode: voicePickCode,
              customVarValues: customVarValues,
              packDateFormat: packDateFormat,
              packDateOffset: packDateOffset,
            ),
          );
          final height = el['height'] ?? 70;
          final showText = el['showText'] == true ? 'Y' : 'N';
          buffer.writeln('^FO$x,$y');
          buffer.writeln('^BEN,$height,$showText,N,Y');
          buffer.writeln('^FD$data^FS');
          break;

        case 'voicepick':
          final voiceText = _replaceVariables(
            el['text'] ?? '',
            product: product,
            lotNumber: lotNumber,
            packDate: packDate,
            voicePickCode: voicePickCode,
            customVarValues: customVarValues,
            packDateFormat: packDateFormat,
            packDateOffset: packDateOffset,
          );
          final parts = voiceText.split('-');
          final firstPair = parts.isNotEmpty ? parts[0] : '00';
          final secondPair = parts.length > 1 ? parts[1] : '00';
          final boxWidth = el['width'] ?? 100;
          final boxHeight = el['height'] ?? 50;
          final largeFontSize = el['fontSize'] ?? 36;
          final smallFontSize = (largeFontSize * 0.6).round();

          // Draw black box
          buffer.writeln('^FO$x,$y');
          buffer.writeln('^GB$boxWidth,$boxHeight,$boxHeight,B^FS');

          // Calculate positions
          final largeCharWidth = (largeFontSize * 0.6).round();
          final smallCharWidth = (smallFontSize * 0.6).round();
          const gap = 4;
          final totalWidth = (largeCharWidth * 2) + gap + (smallCharWidth * 2);
          final startX = x + ((boxWidth - totalWidth) / 2).round();
          final largeY = y + ((boxHeight - largeFontSize) / 2).round();
          final smallY = y + ((boxHeight - smallFontSize) / 2).round();

          // First pair (large white text)
          buffer.writeln('^FO$startX,$largeY');
          buffer.writeln('^FR^A0N,$largeFontSize,$largeFontSize');
          buffer.writeln('^FD$firstPair^FS');

          // Second pair (small white text)
          final secondX = startX + (largeCharWidth * 2) + gap;
          buffer.writeln('^FO$secondX,$smallY');
          buffer.writeln('^FR^A0N,$smallFontSize,$smallFontSize');
          buffer.writeln('^FD$secondPair^FS');
          break;

        case 'datebox':
          final text = _replaceVariables(
            el['text'] ?? '',
            product: product,
            lotNumber: lotNumber,
            packDate: packDate,
            voicePickCode: voicePickCode,
            customVarValues: customVarValues,
            packDateFormat: packDateFormat,
            packDateOffset: packDateOffset,
          );
          final width = el['width'] ?? 80;
          final height = el['height'] ?? 40;
          final fontSize = el['fontSize'] ?? 18;
          buffer.writeln('^FO$x,$y');
          buffer.writeln('^GB$width,$height,2^FS');
          buffer.writeln('^FO${x + 5},${y + 10}');
          buffer.writeln('^A0N,$fontSize,$fontSize');
          buffer.writeln('^FD$text^FS');
          break;

        case 'box':
          final width = el['width'] ?? 100;
          final height = el['height'] ?? 50;
          final borderWidth = el['borderWidth'] ?? 2;
          buffer.writeln('^FO$x,$y');
          buffer.writeln('^GB$width,$height,$borderWidth^FS');
          break;

        case 'line':
          final width = el['width'] ?? 200;
          final height = el['height'] ?? 2;
          buffer.writeln('^FO$x,$y');
          buffer.writeln('^GB$width,$height,$height^FS');
          break;
      }
    }

    buffer.write('^XZ');
    return buffer.toString();
  }

  /// Replace variable placeholders with actual values
  static String _replaceVariables(
    String text, {
    Product? product,
    String? lotNumber,
    String? packDate,
    String? voicePickCode,
    Map<String, dynamic> customVarValues = const {},
    String? packDateFormat,
    int packDateOffset = 0,
  }) {
    var result = text;

    // Product variables with fallback support
    result = result.replaceAllMapped(
      RegExp(r'\{\{product\.(\w+)(?:\|([^}]*))?\}\}'),
      (match) {
        final field = match.group(1)!;
        final fallback = match.group(2) ?? '';

        // Handle _check suffix
        if (field.endsWith('_check')) {
          final baseField = field.replaceAll('_check', '');
          final value = product?.getField(baseField);
          if (value != null && value.isNotEmpty) {
            return _addBarcodeCheckDigit(value);
          }
          return fallback;
        }

        final value = product?.getField(field);
        return (value != null && value.isNotEmpty) ? value : fallback;
      },
    );

    // Date variables with offset support
    result = result.replaceAllMapped(
      RegExp(r'\{\{date\.(\w+(?:[-/]\w+)*)(?:\(([+-]?\d+)\))?(?:\|([^}]*))?\}\}'),
      (match) {
        final format = match.group(1)!;
        final offset = int.tryParse(match.group(2) ?? '') ?? 0;
        final fallback = match.group(3) ?? '';
        final formatted = _formatDate(format, offset);
        return formatted.isNotEmpty ? formatted : fallback;
      },
    );

    // Lot number
    result = result.replaceAllMapped(
      RegExp(r'\{\{lot_number(?:\|([^}]*))?\}\}'),
      (match) {
        final fallback = match.group(1) ?? '';
        return (lotNumber != null && lotNumber.isNotEmpty) ? lotNumber : fallback;
      },
    );

    // Pack date
    result = result.replaceAllMapped(
      RegExp(r'\{\{pack_date(?:\|([^}]*))?\}\}'),
      (match) {
        final fallback = match.group(1) ?? '';
        return (packDate != null && packDate.isNotEmpty) ? packDate : fallback;
      },
    );

    // Voice pick code
    result = result.replaceAllMapped(
      RegExp(r'\{\{voice_pick(?:\|([^}]*))?\}\}'),
      (match) {
        final fallback = match.group(1) ?? '';
        return (voicePickCode != null && voicePickCode.isNotEmpty)
            ? voicePickCode
            : fallback;
      },
    );

    // Custom variables
    result = result.replaceAllMapped(
      RegExp(r'\{\{custom\.(\w+)(?:\|([^}]*))?\}\}'),
      (match) {
        final key = match.group(1)!;
        final fallback = match.group(2) ?? '';
        final value = customVarValues[key]?.toString();
        return (value != null && value.isNotEmpty) ? value : fallback;
      },
    );

    return result;
  }

  /// Format date with given format and offset
  static String _formatDate(String format, int offsetDays) {
    final date = DateTime.now().add(Duration(days: offsetDays));
    final mm = date.month.toString().padLeft(2, '0');
    final dd = date.day.toString().padLeft(2, '0');
    final yy = (date.year % 100).toString().padLeft(2, '0');
    final yyyy = date.year.toString();
    final mmm = _months[date.month - 1];

    // Julian day
    final startOfYear = DateTime(date.year, 1, 1);
    final julian = date.difference(startOfYear).inDays + 1;
    final julianStr = julian.toString().padLeft(3, '0');

    switch (format) {
      case 'MMMDD': return '$mmm$dd';
      case 'DDMMM': return '$dd$mmm';
      case 'MMMDDYY': return '$mmm$dd$yy';
      case 'DDMMMYY': return '$dd$mmm$yy';
      case 'MMDDYY': return '$mm$dd$yy';
      case 'DDMMYY': return '$dd$mm$yy';
      case 'YYMMDD': return '$yy$mm$dd';
      case 'MM/DD/YY': return '$mm/$dd/$yy';
      case 'DD/MM/YY': return '$dd/$mm/$yy';
      case 'MM-DD-YY': return '$mm-$dd-$yy';
      case 'YYYY-MM-DD': return '$yyyy-$mm-$dd';
      case 'julian': return julianStr;
      case 'YYDDD': return '$yy$julianStr';
      case 'YYYYDDD': return '$yyyy$julianStr';
      case 'month': return mm;
      case 'day': return dd;
      case 'year': return yyyy;
      case 'year2': return yy;
      case 'MMM': return mmm;
      default: return '$mm/$dd/$yy';
    }
  }

  /// CRC-16 table for voice pick code generation
  static final List<int> _crc16Table = [
    0x0000, 0xc0c1, 0xc181, 0x0140, 0xc301, 0x03c0, 0x0280, 0xc241,
    0xc601, 0x06c0, 0x0780, 0xc741, 0x0500, 0xc5c1, 0xc481, 0x0440,
    0xcc01, 0x0cc0, 0x0d80, 0xcd41, 0x0f00, 0xcfc1, 0xce81, 0x0e40,
    0x0a00, 0xcac1, 0xcb81, 0x0b40, 0xc901, 0x09c0, 0x0880, 0xc841,
    0xd801, 0x18c0, 0x1980, 0xd941, 0x1b00, 0xdbc1, 0xda81, 0x1a40,
    0x1e00, 0xdec1, 0xdf81, 0x1f40, 0xdd01, 0x1dc0, 0x1c80, 0xdc41,
    0x1400, 0xd4c1, 0xd581, 0x1540, 0xd701, 0x17c0, 0x1680, 0xd641,
    0xd201, 0x12c0, 0x1380, 0xd341, 0x1100, 0xd1c1, 0xd081, 0x1040,
    0xf001, 0x30c0, 0x3180, 0xf141, 0x3300, 0xf3c1, 0xf281, 0x3240,
    0x3600, 0xf6c1, 0xf781, 0x3740, 0xf501, 0x35c0, 0x3480, 0xf441,
    0x3c00, 0xfcc1, 0xfd81, 0x3d40, 0xff01, 0x3fc0, 0x3e80, 0xfe41,
    0xfa01, 0x3ac0, 0x3b80, 0xfb41, 0x3900, 0xf9c1, 0xf881, 0x3840,
    0x2800, 0xe8c1, 0xe981, 0x2940, 0xeb01, 0x2bc0, 0x2a80, 0xea41,
    0xee01, 0x2ec0, 0x2f80, 0xef41, 0x2d00, 0xedc1, 0xec81, 0x2c40,
    0xe401, 0x24c0, 0x2580, 0xe541, 0x2700, 0xe7c1, 0xe681, 0x2640,
    0x2200, 0xe2c1, 0xe381, 0x2340, 0xe101, 0x21c0, 0x2080, 0xe041,
    0xa001, 0x60c0, 0x6180, 0xa141, 0x6300, 0xa3c1, 0xa281, 0x6240,
    0x6600, 0xa6c1, 0xa781, 0x6740, 0xa501, 0x65c0, 0x6480, 0xa441,
    0x6c00, 0xacc1, 0xad81, 0x6d40, 0xaf01, 0x6fc0, 0x6e80, 0xae41,
    0xaa01, 0x6ac0, 0x6b80, 0xab41, 0x6900, 0xa9c1, 0xa881, 0x6840,
    0x7800, 0xb8c1, 0xb981, 0x7940, 0xbb01, 0x7bc0, 0x7a80, 0xba41,
    0xbe01, 0x7ec0, 0x7f80, 0xbf41, 0x7d00, 0xbdc1, 0xbc81, 0x7c40,
    0xb401, 0x74c0, 0x7580, 0xb541, 0x7700, 0xb7c1, 0xb681, 0x7640,
    0x7200, 0xb2c1, 0xb381, 0x7340, 0xb101, 0x71c0, 0x7080, 0xb041,
    0x5000, 0x90c1, 0x9181, 0x5140, 0x9301, 0x53c0, 0x5280, 0x9241,
    0x9601, 0x56c0, 0x5780, 0x9741, 0x5500, 0x95c1, 0x9481, 0x5440,
    0x9c01, 0x5cc0, 0x5d80, 0x9d41, 0x5f00, 0x9fc1, 0x9e81, 0x5e40,
    0x5a00, 0x9ac1, 0x9b81, 0x5b40, 0x9901, 0x59c0, 0x5880, 0x9841,
    0x8801, 0x48c0, 0x4980, 0x8941, 0x4b00, 0x8bc1, 0x8a81, 0x4a40,
    0x4e00, 0x8ec1, 0x8f81, 0x4f40, 0x8d01, 0x4dc0, 0x4c80, 0x8c41,
    0x4400, 0x84c1, 0x8581, 0x4540, 0x8701, 0x47c0, 0x4680, 0x8641,
    0x8201, 0x42c0, 0x4380, 0x8341, 0x4100, 0x81c1, 0x8081, 0x4040,
  ];

  /// Generate voice pick code from GTIN, lot number, and pack date
  static String _generateVoicePickCode(String gtin, String lotNumber, String packDate) {
    final combined = '$gtin$lotNumber$packDate'.toUpperCase();
    var crc = 0;
    for (var i = 0; i < combined.length; i++) {
      final byte = combined.codeUnitAt(i) & 0xFF;
      crc = (crc >> 8) ^ _crc16Table[(crc ^ byte) & 0xFF];
    }
    final code = crc.toString().padLeft(4, '0');
    final lastFour = code.substring(code.length - 4);
    return '${lastFour.substring(0, 2)}-${lastFour.substring(2)}';
  }

  /// Calculate GS1 check digit
  static String _calculateCheckDigit(String digits) {
    final nums = digits.replaceAll(RegExp(r'\D'), '').split('').map(int.parse).toList();
    if (nums.isEmpty) return '';

    var sum = 0;
    final len = nums.length;
    for (var i = 0; i < len; i++) {
      final multiplier = (len - i) % 2 == 0 ? 1 : 3;
      sum += nums[i] * multiplier;
    }
    return ((10 - (sum % 10)) % 10).toString();
  }

  /// Add check digit to barcode if needed
  static String _addBarcodeCheckDigit(String code) {
    final digits = code.replaceAll(RegExp(r'\D'), '');
    // Standard lengths with check digit - return as-is
    if ([8, 12, 13, 14].contains(digits.length)) {
      return digits;
    }
    // Lengths without check digit - add it
    if ([7, 11, 12, 13].contains(digits.length)) {
      return digits + _calculateCheckDigit(digits);
    }
    return code;
  }
}
