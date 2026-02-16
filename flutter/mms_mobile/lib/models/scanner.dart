class Scanner {
  final String id;
  final String name;
  final String? description;
  final String? ipAddress;
  final bool isActive;
  final ScannerConfig? config;

  Scanner({
    required this.id,
    required this.name,
    this.description,
    this.ipAddress,
    this.isActive = true,
    this.config,
  });

  factory Scanner.fromJson(Map<String, dynamic> json) {
    return Scanner(
      id: json['id'] ?? '',
      name: json['name'] ?? '',
      description: json['description'],
      ipAddress: json['ip_address'],
      isActive: json['is_active'] ?? true,
      config: json['config'] != null
          ? ScannerConfig.fromJson(json['config'])
          : null,
    );
  }
}

class ScannerConfig {
  final String? templateId;
  final String? productId;
  final String? lotNumber;
  final String? packDateFormat;
  final int packDateOffset;
  final Map<String, dynamic> variableValues;

  ScannerConfig({
    this.templateId,
    this.productId,
    this.lotNumber,
    this.packDateFormat,
    this.packDateOffset = 0,
    this.variableValues = const {},
  });

  factory ScannerConfig.fromJson(Map<String, dynamic> json) {
    return ScannerConfig(
      templateId: json['template_id'],
      productId: json['product_id'],
      lotNumber: json['lot_number'],
      packDateFormat: json['pack_date_format'],
      packDateOffset: json['pack_date_offset'] ?? 0,
      variableValues: json['variable_values'] ?? {},
    );
  }

  Map<String, dynamic> toJson() => {
    'template_id': templateId,
    'product_id': productId,
    'lot_number': lotNumber,
    'pack_date_format': packDateFormat,
    'pack_date_offset': packDateOffset,
    'variable_values': variableValues,
  };
}
