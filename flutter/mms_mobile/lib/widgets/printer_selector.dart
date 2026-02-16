import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/app_provider.dart';

class PrinterSelector extends StatelessWidget {
  const PrinterSelector({super.key});

  @override
  Widget build(BuildContext context) {
    return Consumer<AppProvider>(
      builder: (context, provider, child) {
        if (provider.loadingPrinters) {
          return const Card(
            child: Padding(
              padding: EdgeInsets.all(16),
              child: Center(child: CircularProgressIndicator()),
            ),
          );
        }

        return Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      'Printer',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    if (provider.selectedPrinter != null)
                      _StatusBadge(
                        isOnline: provider.selectedPrinter!.isOnline,
                        isPrinting: provider.selectedPrinter!.isPrinting,
                      ),
                  ],
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField(
                  value: provider.selectedPrinter?.id,
                  decoration: const InputDecoration(
                    border: OutlineInputBorder(),
                    contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  ),
                  isExpanded: true,
                  items: provider.printers.map((printer) {
                    return DropdownMenuItem(
                      value: printer.id,
                      child: Row(
                        children: [
                          Icon(
                            Icons.print,
                            size: 20,
                            color: printer.isOnline ? Colors.green : Colors.red,
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(printer.name),
                                Text(
                                  printer.ipAddress,
                                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                    color: Colors.grey,
                                    fontFamily: 'monospace',
                                  ),
                                ),
                              ],
                            ),
                          ),
                          if (printer.isPrinting)
                            Chip(
                              label: Text('${printer.continuousPrint?.count ?? 0}'),
                              backgroundColor: Colors.blue,
                              labelStyle: const TextStyle(color: Colors.white, fontSize: 12),
                              padding: EdgeInsets.zero,
                              materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                            ),
                        ],
                      ),
                    );
                  }).toList(),
                  onChanged: (id) {
                    if (id != null) {
                      final printer = provider.printers.firstWhere((p) => p.id == id);
                      provider.selectPrinter(printer);
                    }
                  },
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _StatusBadge extends StatelessWidget {
  final bool isOnline;
  final bool isPrinting;

  const _StatusBadge({required this.isOnline, required this.isPrinting});

  @override
  Widget build(BuildContext context) {
    if (isPrinting) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(
          color: Colors.blue,
          borderRadius: BorderRadius.circular(12),
        ),
        child: const Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox(
              width: 12,
              height: 12,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                valueColor: AlwaysStoppedAnimation(Colors.white),
              ),
            ),
            SizedBox(width: 6),
            Text('Printing', style: TextStyle(color: Colors.white, fontSize: 12)),
          ],
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: isOnline ? Colors.green : Colors.red,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        isOnline ? 'Online' : 'Offline',
        style: const TextStyle(color: Colors.white, fontSize: 12),
      ),
    );
  }
}
