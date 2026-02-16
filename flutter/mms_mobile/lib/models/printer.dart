class Printer {
  final String id;
  final String name;
  final String ipAddress;
  final int port;
  final String status;
  final ContinuousPrintJob? continuousPrint;

  Printer({
    required this.id,
    required this.name,
    required this.ipAddress,
    this.port = 6101,
    this.status = 'unknown',
    this.continuousPrint,
  });

  factory Printer.fromJson(Map<String, dynamic> json) {
    return Printer(
      id: json['id'] ?? '',
      name: json['name'] ?? '',
      ipAddress: json['ipAddress'] ?? json['ip'] ?? '',
      port: json['port'] ?? 6101,
      status: json['status'] ?? 'unknown',
      continuousPrint: json['continuousPrint'] != null
          ? ContinuousPrintJob.fromJson(json['continuousPrint'])
          : null,
    );
  }

  bool get isOnline => status == 'online';
  bool get isPrinting => continuousPrint?.active ?? false;
}

class ContinuousPrintJob {
  final bool active;
  final int count;
  final int total;

  ContinuousPrintJob({
    required this.active,
    required this.count,
    required this.total,
  });

  factory ContinuousPrintJob.fromJson(Map<String, dynamic> json) {
    return ContinuousPrintJob(
      active: json['active'] ?? false,
      count: json['count'] ?? 0,
      total: json['total'] ?? 0,
    );
  }
}
