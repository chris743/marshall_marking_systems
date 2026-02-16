class LabelTemplate {
  final String id;
  final String name;
  final String? description;
  final List<dynamic> elements;
  final int labelWidth;
  final int labelHeight;
  final String? folderId;

  LabelTemplate({
    required this.id,
    required this.name,
    this.description,
    required this.elements,
    this.labelWidth = 812,
    this.labelHeight = 406,
    this.folderId,
  });

  factory LabelTemplate.fromJson(Map<String, dynamic> json) {
    var elementsData = json['elements'];
    List<dynamic> elementsList = [];

    if (elementsData is String) {
      // Parse JSON string if needed
      try {
        elementsList = [];
      } catch (_) {}
    } else if (elementsData is List) {
      elementsList = elementsData;
    }

    return LabelTemplate(
      id: json['id'] ?? '',
      name: json['name'] ?? '',
      description: json['description'],
      elements: elementsList,
      labelWidth: json['label_width'] ?? json['labelWidth'] ?? 812,
      labelHeight: json['label_height'] ?? json['labelHeight'] ?? 406,
      folderId: json['folder_id'],
    );
  }
}
