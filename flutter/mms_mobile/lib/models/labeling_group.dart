class LabelingGroup {
  final String id;
  final String name;
  final String? description;
  final String? printerId;
  final bool enabled;
  final int? scannerCount;
  final int? codeCount;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  LabelingGroup({
    required this.id,
    required this.name,
    this.description,
    this.printerId,
    this.enabled = true,
    this.scannerCount,
    this.codeCount,
    this.createdAt,
    this.updatedAt,
  });

  factory LabelingGroup.fromJson(Map<String, dynamic> json) {
    return LabelingGroup(
      id: json['id'] ?? '',
      name: json['name'] ?? '',
      description: json['description'],
      printerId: json['printer_id'],
      enabled: json['enabled'] == true || json['enabled'] == 1,
      scannerCount: json['scanner_count'],
      codeCount: json['code_count'],
      createdAt: json['created_at'] != null
          ? DateTime.tryParse(json['created_at'].toString())
          : null,
      updatedAt: json['updated_at'] != null
          ? DateTime.tryParse(json['updated_at'].toString())
          : null,
    );
  }
}

class GroupConfig {
  final String id;
  final String groupId;
  final String? locationCodeId;
  final String? locationCode;
  final String? templateId;
  final String? templateName;
  final String? productId;
  final String? productDescription;
  final String? gtin;
  final String? companyName;
  final String? companyPrefix;
  final String? itemReference;
  final String? indicatorDigit;
  final String? commodity;
  final String? style;
  final int copies;
  final String? lotNumber;
  final String? packDateFormat;
  final int packDateOffset;
  final Map<String, dynamic> variableValues;
  final bool enabled;

  GroupConfig({
    required this.id,
    required this.groupId,
    this.locationCodeId,
    this.locationCode,
    this.templateId,
    this.templateName,
    this.productId,
    this.productDescription,
    this.gtin,
    this.companyName,
    this.companyPrefix,
    this.itemReference,
    this.indicatorDigit,
    this.commodity,
    this.style,
    this.copies = 1,
    this.lotNumber,
    this.packDateFormat,
    this.packDateOffset = 0,
    this.variableValues = const {},
    this.enabled = true,
  });

  factory GroupConfig.fromJson(Map<String, dynamic> json) {
    Map<String, dynamic> varValues = {};
    if (json['variable_values'] is Map) {
      varValues = Map<String, dynamic>.from(json['variable_values']);
    } else if (json['variable_values'] is String) {
      // JSON string from DB
      try {
        final decoded = json['variable_values'];
        if (decoded is Map) varValues = Map<String, dynamic>.from(decoded);
      } catch (_) {}
    }

    return GroupConfig(
      id: json['id'] ?? '',
      groupId: json['group_id'] ?? '',
      locationCodeId: json['location_code_id'],
      locationCode: json['location_code'],
      templateId: json['template_id'],
      templateName: json['template_name'],
      productId: json['product_id']?.toString(),
      productDescription: json['product_description'],
      gtin: json['gtin'],
      companyName: json['company_name'],
      companyPrefix: json['company_prefix'],
      itemReference: json['item_reference'],
      indicatorDigit: json['indicator_digit'],
      commodity: json['commodity'],
      style: json['style'],
      copies: json['copies'] ?? 1,
      lotNumber: json['lot_number'],
      packDateFormat: json['pack_date_format'],
      packDateOffset: json['pack_date_offset'] ?? 0,
      variableValues: varValues,
      enabled: json['enabled'] == true || json['enabled'] == 1,
    );
  }
}

class LocationCode {
  final String id;
  final String code;
  final String? description;
  final bool enabled;
  final int? usageCount;

  LocationCode({
    required this.id,
    required this.code,
    this.description,
    this.enabled = true,
    this.usageCount,
  });

  factory LocationCode.fromJson(Map<String, dynamic> json) {
    return LocationCode(
      id: json['id'] ?? '',
      code: json['code'] ?? '',
      description: json['description'],
      enabled: json['enabled'] == true || json['enabled'] == 1,
      usageCount: json['usage_count'],
    );
  }

  @override
  String toString() => code;
}

class GroupScanner {
  final String id;
  final String name;
  final String? connectionType;
  final String? connectionString;
  final bool enabled;

  GroupScanner({
    required this.id,
    required this.name,
    this.connectionType,
    this.connectionString,
    this.enabled = true,
  });

  factory GroupScanner.fromJson(Map<String, dynamic> json) {
    return GroupScanner(
      id: json['id'] ?? '',
      name: json['name'] ?? '',
      connectionType: json['connection_type'],
      connectionString: json['connection_string'],
      enabled: json['enabled'] == true || json['enabled'] == 1,
    );
  }
}
